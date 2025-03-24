import { Controller, Get, Req, Res } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { Request, Response } from 'express';

@Controller()
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('/activity/:id')
  async fetchActivity(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.activityService.fetchActivityByUser(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to get Activity',
        error: error.message,
      });
    }
  }
}
