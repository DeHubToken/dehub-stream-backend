import { Module } from '@nestjs/common';
import { SearchQueryService } from './search-query.service';
import { SearchQueryController } from './search-query.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchQuery, SearchQuerySchema } from 'models/SearchQuery';
import { LiveStream, LiveStreamSchema } from 'models/LiveStream';
import { NftModule } from 'src/nft/nft.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SearchQuery.name, schema: SearchQuerySchema },
      { name: LiveStream.name, schema: LiveStreamSchema },
    ]),
    NftModule,
  ],
  controllers: [SearchQueryController],
  providers: [SearchQueryService],
})
export class SearchQueryModule {}
