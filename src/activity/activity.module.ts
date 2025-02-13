import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { CdnModule } from 'src/cdn/cdn.module';

@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
  imports: [CdnModule],
})
export class ActivityModule {}
