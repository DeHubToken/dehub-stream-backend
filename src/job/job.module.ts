import { Module } from '@nestjs/common';
import { JobService } from './job.service';
import { BullModule } from '@nestjs/bull';
import { VideoQueueProcessor ,DmQueueProcessor} from './job.processor';
import { CdnModule } from 'src/cdn/cdn.module';
import { JobGateway } from './job.socket';
import { JobController } from './job.controller';

@Module({
   controllers: [JobController],
  providers: [JobService, VideoQueueProcessor, DmQueueProcessor,JobGateway],
  imports: [
    BullModule.registerQueue({ name: 'transcode' }),
    BullModule.registerQueue({ name: 'dm-uploads' }),
    CdnModule,
  ],
  exports: [JobService],
})
export class JobModule {}
