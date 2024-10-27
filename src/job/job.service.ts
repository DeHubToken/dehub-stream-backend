import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class JobService {
  constructor(
    @InjectQueue('transcode') private readonly transcodeQueue: Queue,
  ) {}

  async addUploadAndTranscodeJob(buffer: Buffer, slug: string, filename: string, mimeType: string, videoId: string) {
    
    await this.transcodeQueue.add({
      buffer,
      slug,
      filename,
      mimeType,
      videoId,
    })
    console.log('Job added to queue:', { slug, filename });

    return {msg: "successful"}
  }
}
