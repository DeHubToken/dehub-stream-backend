import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service';

@Module({
  controllers: [],
  providers: [CdnService],
  exports:[CdnService]
})
export class CdnModule {}


