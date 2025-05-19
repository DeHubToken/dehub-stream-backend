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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    BullModule.registerQueue({
      name: 'chatbot-message-processing',
    }),
    EmbeddingModule,
    ConfigModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService, ChatbotGateway, ChatbotMessageProcessor],
  exports: [ChatbotService],
})
export class ChatbotModule {} 