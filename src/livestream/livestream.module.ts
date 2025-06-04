import { Module } from '@nestjs/common';
import { LivestreamController } from './livestream.controller';
import { LivestreamService } from './livestream.service';
import { MongooseModule } from '@nestjs/mongoose';
import { LiveStream, LiveStreamSchema } from 'models/LiveStream';
import { StreamViewer, StreamViewerSchema } from 'models/LiveStreamViewer';
import { StreamActivity, StreamActivitySchema } from 'models/LiveStreamActivity';
import { ChatGateway } from './chat.gateway';
import { StreamChatService } from './chat.service';
import { HlsService } from './hls.service';
import { LivepeerService } from './livepeer.service';
import { ConnectionService } from './connection.service';
import { ScheduleModule } from '@nestjs/schedule';
import { CdnModule } from 'src/cdn/cdn.module';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LiveStream.name, schema: LiveStreamSchema },
      { name: StreamViewer.name, schema: StreamViewerSchema },
      { name: StreamActivity.name, schema: StreamActivitySchema },
    ]),
    CdnModule,
    RedisModule.forRoot({ url:'localhost:6379', type: 'single'}),
    ScheduleModule.forRoot(),
  ],
  controllers: [LivestreamController],
  providers: [
    LivestreamService,
    ChatGateway,
    StreamChatService,
    HlsService,
    LivepeerService,
    ConnectionService,
  ],
  exports: [LivestreamService,  StreamChatService, ChatGateway],
})
export class LivestreamModule {}
