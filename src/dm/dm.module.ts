import { Module } from '@nestjs/common';
import { DMService } from './dm.service';
import { DMController } from './dm.controller'; 
import { CdnModule } from 'src/cdn/cdn.module';
import { JobModule } from 'src/job/job.module';
@Module({
  controllers: [DMController],
  providers: [DMService],
  imports:[JobModule,CdnModule],
  exports:[DMService,CdnModule,JobModule]
})
export class DmModule {}
