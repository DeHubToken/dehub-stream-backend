import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
interface MediaJobPayload {
  buffer: Buffer;
  slug: string;
  filename: string;
  mimeType: string;
  videoId?: string; // Optional for videos
  imageUrl?: string; // Optional for images
}
@Injectable()
export class JobService {
  constructor(
    @InjectQueue('transcode') private readonly transcodeQueue: Queue,
    @InjectQueue('dm-uploads') private readonly dmUploads: Queue,
  ) {}

  async addUploadAndTranscodeJob(
    buffer: Buffer,
    slug: string,
    filename: string,
    mimeType: string,
    videoId: string,
    imageUrl: string,
  ) {
    await this.transcodeQueue.add({
      buffer,
      slug,
      filename,
      mimeType,
      videoId,
      imageUrl,
    });
    console.log('Job added to queue:', { slug, filename });

    return { msg: 'successful' };
  }

  
  async bulkAddMediaUploadJob(payloads: MediaJobPayload[]) {
    try {
      // Filter valid jobs
      const validJobs = payloads.filter(
        payload => payload.mimeType.startsWith('image/') || payload.mimeType.startsWith('video/'),
      );

      if (validJobs.length === 0) {
        throw new Error('No valid media jobs to add. Ensure mimeType is image or video.');
      }

      // Map each payload to the structure expected by `addBulk`
      const jobs = validJobs.map(payload => ({
        data: payload, // Job data
        opts: { attempts: 3, backoff: 5000 }, // Optional job options
      }));

      // Add all jobs to the queue in bulk
      await this.dmUploads.addBulk(jobs);

      console.log(`Added ${validJobs.length} media upload jobs to the queue.`);

      return { msg: 'Bulk upload jobs added successfully', count: validJobs.length };
    } catch (error) {
      console.error('Error adding bulk media upload jobs:', error.message);
      throw error;
    }
  }
}
