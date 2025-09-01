import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { TokenDocument, TokenModel } from 'models/Token';
import { CdnService } from 'src/cdn/cdn.service';
import { JobGateway } from './job.socket';
import { Message, MessageModel } from 'models/message/dm-messages';
import { config } from '../../config/index';
import { singleMessagePipeline } from 'src/dm/pipline';

@Processor('dm-uploads')
export class DmQueueProcessor {
  constructor(
    private readonly cdnService: CdnService,
    private readonly socketGateway: JobGateway,
  ) {}

  @Process()
  async handleJob(job: Job) {
    console.log('DM Job received:', job.id, job.data);

    const { buffer, filename, mimeType, messageId } = job.data;

    const message: Message & { _id: string } = await MessageModel.findById(messageId);
    if (!message) {
      console.error('Message not found:', messageId);
      throw new Error('Message not found');
    }

    try {
      // Set status to pending at the start of the job
      message.uploadStatus = 'pending';
      await message.save();
      let url: string;
      // Create a unique filename using the messageId and mimeType
      const newFilename = this.generateUniqueFilename(filename, messageId, mimeType);
      // Set the folder dynamically based on mimeType
      const folder = mimeType.startsWith('video/') ? config.dirDmVideos : config.dirDmImages;
      if (!folder) {
        throw new Error('Unsupported media type');
      }
      console.log(`Processing ${mimeType.startsWith('video/') ? 'video' : 'image'} file...`);
      // Upload media
      console.log('folder', folder);
      url = await this.uploadMedia(buffer, newFilename, message._id, folder);
      // Update message document with the uploaded media URL
      message.uploadStatus = 'success';
      message.mediaUrls = [
        ...(message.mediaUrls || []),
        {
          url,
          type: mimeType.startsWith('video/') ? 'video' : 'image', // Assuming type is determined by mimeType
          mimeType,
        },
      ];
      message.msgType = 'media';
      await message.save();
      const updatedMessage = await MessageModel.aggregate(singleMessagePipeline(message._id));
      // Emit success progress to the socket gateway
      this.socketGateway.emitDmUploadProgress({
        dmId: updatedMessage[0].conversation,
        message: updatedMessage[0],
        status: 'success',
      });

      console.log('updatedMessage[0]:',updatedMessage[0])
    } catch (error: any & { message: string }) {
      // Handle upload failure
      console.error('Error processing media:', error);
      // Set the message upload status to failure and log the error reason
      message.uploadStatus = 'failure';
      message.failureReason = error.message; // Store the failure reason
      const updatedMessage = await message.save();
      this.socketGateway.emitDmUploadProgress({
        dmId: updatedMessage.conversation,
        message: updatedMessage,
        status: 'success',
      });
      throw error; // Optionally re-throw to retry the job
    }
  }

  private async uploadMedia(buffer: Buffer, filename: string, messageId: string, folder: string): Promise<string> {
    const onProgress = (progress: number) => {
      this.socketGateway.emitProgress({ progress, stage: 'uploading' }, messageId);
    };

    const url = await this.cdnService.uploadFile(buffer, folder, filename, onProgress);

    return url;
  }

  // Generate a unique filename using messageId and mimeType
  private generateUniqueFilename(filename: string, messageId: string, mimeType: string): string {
    const extension = path.extname(filename); // Get file extension
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, ''); // Use a timestamp for uniqueness
    return `${messageId}-${timestamp}${extension}`; // Generate unique filename based on messageId and timestamp
  }
}

@Processor('transcode')
export class VideoQueueProcessor {
  constructor(
    private readonly cdnService: CdnService,
    private readonly socketGateway: JobGateway,
  ) {}
  @Process()
  async handleJob(job: Job) {
    console.log('Job received:', job.id, Object.keys(job.data || {}));

    // Destructure with filePath support
    let { buffer, slug, filename, mimeType, videoId, imageUrl, filePath } = job.data as any;

    if (!videoId) {
      console.error('[transcode] Missing videoId in job payload', job.id);
      throw new Error('Missing videoId');
    }

    // Load video document (try _id then tokenId if numeric)
    let video = await TokenModel.findById(videoId);
    if (!video && /^\d+$/.test(videoId)) {
      video = await TokenModel.findOne({ tokenId: Number(videoId) });
    }
    if (!video) {
      console.error('[transcode] Video not found for id:', videoId);
      throw new Error('Video not found');
    }

    try {
      video.transcodingStatus = 'on';
      await video.save();

      // If we have a file path and no raw buffer, read it
      if (!buffer && filePath) {
        try {
          buffer = await fs.readFile(filePath);
        } catch (e: any) {
          console.error('[transcode] Failed reading temp file', filePath, e?.message);
          throw new Error('Failed to read temp video file');
        }
      }

      // Rehydrate Bull serialized Buffer ( { type: 'Buffer', data: [...] } )
      if (buffer && typeof buffer === 'object' && (buffer as any).type === 'Buffer' && Array.isArray((buffer as any).data)) {
        buffer = Buffer.from((buffer as any).data);
      }

      if (!Buffer.isBuffer(buffer)) {
        throw new Error('Invalid or missing video buffer');
      }

      const url = await this.transcodeAndUploadFile(buffer, filename, mimeType, video);
      video.videoUrl = url;
      video.imageUrl = imageUrl;
      video.imageExt = 'jpg';
      video.progress = 100;
      const baseUrl = process.env.CDN_BASE_URL || '';
      if (!baseUrl) {
        throw new Error('CDN_BASE_URL is not configured');
      }
      try {
        video.videoDuration = await this.cdnService.getFileDuration(baseUrl + url);
      } catch (durationErr: any) {
        console.warn('[transcode] Unable to get video duration:', durationErr?.message);
      }
      video.transcodingStatus = 'done';
      await video.save();

      // Cleanup temp file if provided
      if (filePath) {
        fs.unlink(filePath).catch(() => {});
      }

      console.log('Video processed and uploaded:', url);
    } catch (error: any & { message: string }) {
      console.error('Error processing video:', error);
      video.transcodingStatus = 'failed';
      await video.save().catch(() => {});
      // Attempt cleanup
      if (filePath) {
        fs.unlink(filePath).catch(() => {});
      }
      throw error; // maintain Bull retry behavior
    }
  }

  private async transcodeAndUploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    video: TokenDocument,
  ): Promise<string> {
    const isVideoAndNotMp4 = mimeType.startsWith('video/') && !filename.endsWith('.mp4');

    // Transcode if necessary
    if (isVideoAndNotMp4) {
      try {
        const { uploadBuffer, uploadFileName } = await this.transcodeToMp4(buffer, filename, video);
        return await this.uploadAndSaveVideo(uploadBuffer, uploadFileName, video.tokenId);
      } catch (error: any & { message: string }) {
        console.error('Error during transcoding:', error);
        video.transcodingStatus = 'failed';
        await video.save();
        throw error;
      }
    } else {
      return await this.uploadAndSaveVideo(buffer, `${video.tokenId}.mp4`, video.tokenId);
    }
  }

  private async transcodeToMp4(
    buffer: Buffer,
    filename: string,
    video: TokenDocument,
  ): Promise<{ uploadBuffer: Buffer; uploadFileName: string }> {
    const tempInputPath = `/tmp/${filename}`;
    const tempOutputPath = `/tmp/${path.parse(filename).name}.mp4`;

    // Save the buffer to a temporary file
    await fs.writeFile(tempInputPath, buffer);

    // Transcode video to MP4
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempInputPath)
        .outputFormat('mp4')
        .on('progress', (progress: any) => {
          console.log(`transcoding progress ${progress}`);
          const percentage = progress.percent || (progress.frames / progress.totalFrames) * 100 || 0;
          this.socketGateway.emitProgress(
            { progress: Math.floor(percentage), stage: 'transcoding' },
            video.tokenId.toString(),
          );
        })
        .on('end', async () => {
          console.log('Transcoding complete');
          resolve();
        })
        .on('error', (error: any) => {
          console.error('Error transcoding video:', error);
          reject(error);
        })
        .save(tempOutputPath);
    });

    const uploadBuffer = await fs.readFile(tempOutputPath);
    const uploadFileName = `${video.tokenId}.mp4`;

    // Clean up temp files
    await fs.unlink(tempInputPath);
    await fs.unlink(tempOutputPath);

    return { uploadBuffer, uploadFileName };
  }

  private async uploadAndSaveVideo(buffer: Buffer, filename: string, tokenId: number): Promise<string> {
    const onProgress = (progress: number) => {
      this.socketGateway.emitProgress({ progress, stage: 'uploading' }, tokenId.toString());
    };
    const url = await this.cdnService.uploadFile(buffer, 'videos', filename, onProgress);
    return url;
  }
}
