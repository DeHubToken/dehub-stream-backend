import { Module } from '@nestjs/common';
import { ServerLogsService } from './server-logs.service';
import { ServerLogsController } from './server-logs.controller';

@Module({
  controllers: [ServerLogsController],
  providers: [ServerLogsService],
})
export class ServerLogsModule {}
