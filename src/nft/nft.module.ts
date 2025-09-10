import { Module } from '@nestjs/common';
import { NftService } from './nft.service';
import { NFTController } from './nft.controller';
import { CdnModule } from 'src/cdn/cdn.module';
import { JobModule } from 'src/job/job.module';
import { NftIndexer } from './mint.indexer';
import { MongooseModule } from '@nestjs/mongoose';
import { LiveStream, LiveStreamSchema } from 'models/LiveStream';

@Module({
  controllers: [NFTController],
  providers: [
    NftService,
    // , NftIndexer
  ],
  imports: [CdnModule, JobModule, MongooseModule.forFeature([{ name: LiveStream.name, schema: LiveStreamSchema }])],
  exports: [NftService],
})
export class NftModule {}
