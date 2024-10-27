import { Module } from '@nestjs/common';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';
import { CdnModule } from 'src/cdn/cdn.module';

@Module({
  controllers: [AssetController],
  providers: [AssetService],
  imports:[CdnModule]
})
export class AssetModule {}
