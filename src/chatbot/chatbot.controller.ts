import { Controller, Get, Post, Body, UseGuards, Req, Query, Param, NotFoundException, BadRequestException, HttpCode, HttpStatus, InternalServerErrorException, Logger, ValidationPipe, HttpException } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationDocument } from '../../models/Conversation';
import { ChatMessageDocument } from '../../models/ChatMessage';
import { CustomUserRateLimitGuard, RateLimit } from './guards/custom-user-rate-limit.guard';
import { AgenticRAGService } from './services/agentic-rag.service';
import { ChromaService } from '../embedding/chroma.service';

const validationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
};

@Controller('chatbot')
export class ChatbotController {
  private readonly logger = new Logger(ChatbotController.name);

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly agenticRAGService: AgenticRAGService,
    private readonly chromaService: ChromaService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<any> {
    this.logger.log('Chatbot health check requested.');
    const checks = {
      aiService: 'pending',
      vectorDb: 'pending',
    };
    let overallStatus = 'ok';
    let httpStatus = HttpStatus.OK;
    const errors: string[] = [];

    try {
      if (this.agenticRAGService) {
        checks.aiService = 'ok';
      } else {
        throw new Error('AgenticRAGService not available');
      }
    } catch (error) {
      this.logger.error(`AI Service health check failed: ${error.message}`, error.stack);
      checks.aiService = 'error';
      errors.push(`AI Service Error: ${error.message}`);
      overallStatus = 'error';
      httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
    }

    try {
      await this.chromaService.getDocumentCount();
      checks.vectorDb = 'ok';
    } catch (error) {
      this.logger.error(`Vector DB (Chroma) health check failed: ${error.message}`, error.stack);
      checks.vectorDb = 'error';
      errors.push(`VectorDB Error: ${error.message}`);
      overallStatus = 'error';
      httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      errors: errors.length > 0 ? errors : undefined,
    };

    if (overallStatus === 'error') {
      throw new HttpException(response, httpStatus);
    }
    
    return response;
  }

  @Get()
  async getUserConversations(@Query('address') address: string): Promise<ConversationDocument[]> {
    if (!address) {
      throw new BadRequestException('Address parameter is required');
    }
    return this.chatbotService.getConversationsForUser(address);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @Query('address') address: string,
    @Body(new ValidationPipe(validationPipeOptions)) createConversationDto: CreateConversationDto,
  ): Promise<ConversationDocument> {
    if (!address) {
      throw new BadRequestException('Address parameter is required');
    }
    return this.chatbotService.createConversation(address, createConversationDto.title);
  }
} 
