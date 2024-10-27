import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { TokenDocument, TokenModel } from 'models/Token';
import { CdnService } from 'src/cdn/cdn.service';
import { JobGateway } from './job.socket';

@Processor('transcode')
export class VideoQueueProcessor {
  constructor(private readonly cdnService: CdnService, private readonly socketGateway: JobGateway){}
  @Process()
  async handleJob(job: Job) {
    console.log('Job received:');
    const { buffer, slug, filename, mimeType, videoId } = job.data;
    
    const video = await TokenModel.findById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    try {
      video.transcodingStatus = 'on';
      const url = await this.transcodeAndUploadFile(buffer, filename, mimeType, video)
      video.videoUrl = url
      video.progress= 100
      video.videoDuration = await this.cdnService.getFileDuration(process.env.CDN_BASE_URL+url)
      video.transcodingStatus = "done"
      await video.save()

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
    video: TokenDocument
  ): Promise<string> {
    const isVideoAndNotMp4 = mimeType.startsWith('video/') && !filename.endsWith('.mp4');

    // Transcode if necessary
    if (isVideoAndNotMp4) {
      
      try {
        await this.transcodeToMp4(buffer, filename, video);
        return await this.uploadAndSaveVideo(buffer, `${video.tokenId}.mp4`, video.tokenId);
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

  private async transcodeToMp4(buffer: Buffer, filename: string, video: TokenDocument): Promise<{ uploadBuffer: Buffer, uploadFileName: string }> {
    const tempInputPath = `/tmp/${filename}`;
    const tempOutputPath = `/tmp/${path.parse(filename).name}.mp4`;

    // Save the buffer to a temporary file
    await fs.writeFile(tempInputPath, buffer);

    // Transcode video to MP4
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempInputPath)
        .outputFormat('mp4')
        .on('progress', async (progress: any) => {
          console.log(progress)
          this.socketGateway.emitProgress({progress: Math.floor(progress), stage:"transcoding"}, video.tokenId.toString())
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

  private async uploadAndSaveVideo(buffer:Buffer, filename: string, tokenId:number): Promise<string> {
    const onProgress = (progress:number)=>{
      this.socketGateway.emitProgress({progress, stage:"uploading"}, tokenId.toString())
    }
    const url = this.cdnService.uploadFile(buffer, "videos", filename, onProgress)
    
    return url;
  }
  
}
