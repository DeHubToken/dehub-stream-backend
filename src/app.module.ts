import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { NftModule } from './nft/nft.module';
import { NotificationModule } from './notification/notification.module';
import { CdnModule } from './cdn/cdn.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
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
import { PlanEventListenerService } from './job/plans.listener';

@Module({
  imports: [
    ConfigModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    UserModule,
    NftModule,
    NotificationModule,
    CdnModule,
    AuthModule,
    PlansModule,
    ReactionModule,
    CategoryModule,
    LeaderboardModule,
    AssetModule,
    JobModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AppController
  ],
  providers: [
    AppService, 
    StreamCronService,
     PlanEventListenerService
    ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ReqloggerMiddleware).forRoutes('*');
  }
}
