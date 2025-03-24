import { Controller, Get, Req, Res } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { Request, Response } from 'express';

@Controller()
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}
  @Get('/leaderboard')
  async getUsernames(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.leaderboardService.getLeaderboard(req,res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to fetch usernames', error: error.message });
    }
  }

 
}
