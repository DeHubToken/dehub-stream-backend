import { Module } from '@nestjs/common';
import { DMService } from './dm.service';
import { DMController } from './dm.controller'; 

@Module({
  controllers: [DMController],
  providers: [DMService],
  imports:[],
  exports:[DMService]
})
export class DmModule {}
