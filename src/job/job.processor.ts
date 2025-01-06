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
@Processor('transcode')
export class VideoQueueProcessor {
  constructor(
    private readonly cdnService: CdnService,
    private readonly socketGateway: JobGateway,
  ) {}
  @Process()
  async handleJob(job: Job) {
    console.log('Job received:');
    const { buffer, slug, filename, mimeType, videoId, imageUrl } = job.data;

    const video = await TokenModel.findById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    try {
      video.transcodingStatus = 'on';
      const url = await this.transcodeAndUploadFile(buffer, filename, mimeType, video);
      video.videoUrl = url;
      video.imageUrl = imageUrl;
      video.imageExt = 'jpg';
      video.progress = 100;
      const baseUrl = process.env.CDN_BASE_URL || '';
      if (!baseUrl) {
        throw new Error('CDN_BASE_URL is not configured');
      }
      video.videoDuration = await this.cdnService.getFileDuration(baseUrl + url);
      video.transcodingStatus = 'done';
      await video.save();

      console.log('Video processed and uploaded:', url);
    } catch (error) {
      console.error('Error processing video:', error);
      throw error; // Optionally handle error
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
      } catch (error) {
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
          mimeType
        },
      ];
      message.msgType = 'media';
      await message.save();
      // Emit success progress to the socket gateway
      this.socketGateway.emitProgress({ progress: 100, stage: 'completed' }, message._id.toString());
      console.log('Media processed and uploaded:', url);
    } catch (error) {
      // Handle upload failure
      console.error('Error processing media:', error);
      // Set the message upload status to failure and log the error reason
      message.uploadStatus = 'failure';
      message.failureReason = error.message; // Store the failure reason
      await message.save();
      this.socketGateway.emitProgress({ progress: 0, stage: 'failed' }, message._id.toString());
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
