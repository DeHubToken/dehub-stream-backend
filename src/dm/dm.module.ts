import { Module } from '@nestjs/common';
import { DMService } from './dm.service';
import { DMController } from './dm.controller'; 
import { CdnModule } from 'src/cdn/cdn.module';
import { JobModule } from 'src/job/job.module';
import { DMSocketController } from './dm.socket.controller';
@Module({
  controllers: [DMController],
  providers: [DMService, DMSocketController],
  imports:[JobModule,CdnModule],
  exports:[DMService,CdnModule,JobModule, DMSocketController]
})
export class DmModule {}
