import { Module, forwardRef } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotGateway } from './chatbot.gateway';
import { ChatbotController } from './chatbot.controller';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from '../auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from '../../models/Conversation';
import { ChatMessage, ChatMessageSchema } from '../../models/ChatMessage';
import { ChatbotMessageProcessor } from './processors/chatbot-message.processor';

@Module({
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    ChatbotGateway,
    ChatbotMessageProcessor,
  ],
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    BullModule.registerQueue(
      { name: 'chatbot' },
      { name: 'chatbot-message-processing' },
      { name: 'embedding-ingestion' }, // For Phase 3 (RAG implementation)
      { name: 'image-generation' },
      { name: 'image-analysis' }
    ),
  ],
  exports: [ChatbotService]
})
export class ChatbotModule {} 