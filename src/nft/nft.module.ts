import { Module } from '@nestjs/common';
import { NftService } from './nft.service';
import { NFTController } from './nft.controller';
import { CdnModule } from 'src/cdn/cdn.module';
import { JobModule } from 'src/job/job.module';
import { NftIndexer } from './mint.indexer';

@Module({
  controllers: [NFTController],
  providers: [NftService, NftIndexer],
  imports:[CdnModule, JobModule]
})
export class NftModule {}
