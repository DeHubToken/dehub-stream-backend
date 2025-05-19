import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { NftModule } from './nft/nft.module';
import { NotificationModule } from './notification/notification.module';
import { CdnModule } from './cdn/cdn.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ReqloggerMiddleware } from './reqlogger/reqlogger.middleware';
import { ReactionModule } from './reaction/reaction.module';
import { CategoryModule } from './category/category.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AssetModule } from './asset/asset.module';
import { JobModule } from './job/job.module';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { StreamCronService } from './job/stream-cron.service';
import { PlansModule } from './plans/plans.module';
// import { PlanEventListenerService } from './job/plans.listener';
import { DmModule } from './dm/dm.module';
import { LivestreamModule } from './livestream/livestream.module';
import { MongooseModule } from '@nestjs/mongoose';
import { config } from 'config';
import { ActivityModule } from './activity/activity.module';
import { FeedReportModule } from './feed-report/feed-report.module';
import { BuySellCryptoModule } from './crypto-payment/buy-sell-crypto.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { TracingModule } from './tracing/tracing.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    EventEmitterModule.forRoot(),
    MongooseModule.forRoot(`mongodb://${config.mongo.host}:${config.mongo.port}/${config.mongo.dbName}`),
    UserModule, 
    NftModule, NotificationModule, CdnModule, AuthModule,ActivityModule,FeedReportModule, PlansModule,DmModule, ReactionModule, CategoryModule, LeaderboardModule, AssetModule, JobModule, ScheduleModule.forRoot(), LivestreamModule, BuySellCryptoModule, ChatbotModule, EmbeddingModule, TracingModule],
  controllers: [AppController],
  providers: [AppService, StreamCronService,
    // PlanEventListenerService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ReqloggerMiddleware).forRoutes('*');
  }
}
