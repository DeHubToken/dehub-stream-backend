import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { FeedReportService } from './feed-report.service';
import { Request, Response } from 'express';

@Controller()
export class FeedReportController {
  constructor(private readonly feedReportService: FeedReportService) {}

  @Post('/nft/reports')
  async addReport(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.feedReportService.addReport(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to get Activity',
        error: error.message,
      });
    }
  }
  @Get('/nft/reports')
  async fetchFeedReport(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.feedReportService.fetchFeedReports(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to get Activity',
        error: error.message,
      });
    }
  }
  @Get('/reports/:tokenId')
  async fetchReportByTokenId(@Req() req, @Res() res: Response) {
    try {
      // Call the service to fetch reports using tokenId
      return await this.feedReportService.fetchReportByTokenId(req, res);
    } catch (error: any & { message: string }) {
      // Handle errors
      return res.status(500).json({
        message: 'Failed to get Activity',
        error: error.message,
      });
    }
  }
}
