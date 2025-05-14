import { Module, forwardRef } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotGateway } from './chatbot.gateway';
import { ChatbotController } from './chatbot.controller';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [ChatbotController],
  providers: [ChatbotService, ChatbotGateway],
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    BullModule.registerQueue({
      name: 'chatbot',
    }),
  ],
  exports: [ChatbotService]
})
export class ChatbotModule {} 