import {
  Controller,
  Get,
  Patch,
  Req,
  Res,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'common/guards/auth.guard';
import { Request, Response } from 'express';
import { NotificationsService } from './notification.service';

@Controller('notification')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getUnreadNotifications(@Req() req: Request, @Res() res: Response) {
    try {
      await this.notificationsService.getUnreadNotifications(req, res);
    } catch (error: any & { message: string }) {
      console.error('-----Error fetching unread notifications:', error);
      return res.status(500).json({ error: 'Failed to fetch unread notifications' });
    }
  }

  @Patch(':notificationId')
  @UseGuards(AuthGuard)
  async markNotificationAsRead(
    @Req() req: Request,
    @Res() res: Response
  ) {
    try {
      await this.notificationsService.markNotificationAsRead(req, res);
    } catch (error: any & { message: string }) {
      console.error('-----Error marking notification as read:', error);
      return res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }
}
