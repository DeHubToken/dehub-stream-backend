import { Module } from '@nestjs/common'; 
import { FeedReportController } from './feed-report.controller';
import { FeedReportService } from './feed-report.service';
@Module({
  controllers: [FeedReportController],
  providers: [FeedReportService], 
  exports:[FeedReportService,]
})
export class FeedReportModule {}
