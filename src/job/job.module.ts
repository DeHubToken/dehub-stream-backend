import { Module } from '@nestjs/common';
import { JobService } from './job.service';
import { BullModule } from '@nestjs/bull';
import { VideoQueueProcessor, DmQueueProcessor } from './job.processor';
import { CdnModule } from 'src/cdn/cdn.module';
import { JobGateway } from './job.socket';
import { JobController } from './job.controller';

@Module({
  controllers: [JobController],
  providers: [JobService, VideoQueueProcessor, DmQueueProcessor, JobGateway],
  imports: [
    BullModule.registerQueue({
      name: 'transcode',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    BullModule.registerQueue({
      name: 'dm-uploads',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
      },
    }),
    CdnModule,
  ],
  exports: [JobService],
})
export class JobModule {}
