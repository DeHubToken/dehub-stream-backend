import { Controller, Get, Post, Put, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller("job")
export class JobController {
    constructor(
        @InjectQueue('transcode') private readonly transcodeQueue: Queue,
        @InjectQueue('dm-uploads') private readonly dmUploads: Queue,
      ) {}

  @Get('test-queue')
  async testQueue() {
    const waiting = await this.transcodeQueue.getWaiting();
    const active = await this.transcodeQueue.getActive();
    const failed = await this.transcodeQueue.getFailed();

    console.log('Queue status:', {
      waiting: waiting.length,
      active: active.length,
      failed: failed.length,
    });

    if (waiting.length > 0) {
      console.log('Sample waiting job:', {
        id: waiting[0].id,
        data: waiting[0].data,
      });
    }

    if (failed.length > 0) {
      console.log('Sample failed job:', {
        id: failed[0].id,
        error: failed[0].failedReason,
      });
    }

    return {
      waiting: waiting.length,
      active: active.length,
      failed: failed.length,
      waitingJobs: waiting.slice(0, 3).map(job => ({ id: job.id, videoId: job.data.videoId })),
      failedJobs: failed.slice(0, 3).map(job => ({ id: job.id, error: job.failedReason })),
    };
  }
}
