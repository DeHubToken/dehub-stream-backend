import { Module } from '@nestjs/common';
import { JobService } from './job.service';
import { BullModule } from '@nestjs/bull';
import { VideoQueueProcessor } from './job.processor';
import { CdnModule } from 'src/cdn/cdn.module';
import { JobGateway } from './job.socket';

@Module({
  providers: [JobService, VideoQueueProcessor, JobGateway],
  imports: [ 
  BullModule.registerQueue({
    name: 'transcode',
  }),CdnModule],
  exports:[JobService]
})
export class JobModule {}
