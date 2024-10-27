import { Module } from '@nestjs/common';
import { ReactionService } from './reaction.service';
import { ReactionsController } from './reaction.controller';
import { NotificationModule } from 'src/notification/notification.module';
import { UserModule } from 'src/user/user.module';

@Module({
  controllers: [ReactionsController],
  providers: [ReactionService],
  imports: [NotificationModule, UserModule]
})
export class ReactionModule {}
