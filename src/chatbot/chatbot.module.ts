import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { BullModule } from '@nestjs/bull';
import { ChatbotGateway } from './chatbot.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from '../../models/Conversation';
import { ChatMessage, ChatMessageSchema } from '../../models/ChatMessage';
import { ChatbotMessageProcessor } from './processors/chatbot-message.processor';
import { EmbeddingModule } from '../embedding/embedding.module';
import { ConfigModule } from '@nestjs/config';
import { ImageProcessor } from './processors/image.processor';
import { CdnModule } from '../cdn/cdn.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    BullModule.registerQueue(
      {
        name: 'chatbot-message-processing',
      },
      {
        name: 'image-generation',
      }
    ),
    EmbeddingModule,
    ConfigModule,
    CdnModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService, ChatbotGateway, ChatbotMessageProcessor, ImageProcessor],
  exports: [ChatbotService],
})
export class ChatbotModule {} 