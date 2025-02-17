import { Module } from '@nestjs/common';
import { LivestreamService } from './livestream.service';
import { LivestreamController } from './livestream.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { LiveStream, LiveStreamSchema } from 'models/LiveStream';
import { StreamViewer, StreamViewerSchema } from 'models/LiveStreamViewer';
import { StreamChatService } from './chat.service';
import { StreamActivity, StreamActivitySchema } from 'models/LiveStreamActivity';
import { RedisModule } from '@nestjs-modules/ioredis';
import { CdnModule } from 'src/cdn/cdn.module';
import { HlsService } from './hls.service';
import { NmsStreamingService } from './nms.service';
import { ChatGateway } from './chat.gateway';
import { MuxService } from './mux.service';
import { LivepeerService } from './livepeer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LiveStream.name, schema: LiveStreamSchema },
      { name: StreamViewer.name, schema: StreamViewerSchema },
      { name: StreamActivity.name, schema: StreamActivitySchema },
    ]),
    CdnModule,
    RedisModule.forRoot({ url:'localhost:6379', type: 'single'})
  ],
  controllers: [LivestreamController],
  providers: [LivestreamService, StreamChatService, HlsService, ChatGateway, LivepeerService
    // , NmsStreamingService, MuxService
  ],
  exports: [LivestreamService, StreamChatService, ChatGateway]
})
export class LivestreamModule {}
