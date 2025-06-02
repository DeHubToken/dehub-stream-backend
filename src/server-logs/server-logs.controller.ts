import { Controller, Get, Query, Res } from '@nestjs/common';
import { ServerLogsService } from './server-logs.service';
import { Response } from 'express';

@Controller('logs')
export class ServerLogsController {
  constructor(private readonly serverLogsService: ServerLogsService) {}

  @Get()
  async getLogs(@Res() res: Response, @Query('filters') filters: string | string[], @Query('lines') lines = 100) {
    const filterArray = Array.isArray(filters) ? filters : filters ? [filters] : [];

    const logData = await this.serverLogsService.getLogs(parseInt(lines as any, 10), filterArray);

    res.type('text/plain').send(logData);
  }
}
