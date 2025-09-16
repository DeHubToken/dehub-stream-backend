import { Controller, Get, Post, Body, UseGuards, Req, Query, Param, NotFoundException, BadRequestException, HttpCode, HttpStatus, InternalServerErrorException, Logger, ValidationPipe, HttpException } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationDocument } from '../../models/Conversation';
import { DeHubChatbotService } from './services/dehub-chatbot.service';
import { ConfigService } from '@nestjs/config';

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
    private readonly deHubChatbotService: DeHubChatbotService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<any> {
    this.logger.log('Chatbot health check requested.');
    const checks = {
      aiService: 'pending',
    };
    let overallStatus = 'ok';
    let httpStatus = HttpStatus.OK;
    const errors: string[] = [];

    // Check DeHubChatbotService
    try {
      if (this.deHubChatbotService) {
        checks.aiService = 'ok';
        this.logger.debug('DeHubChatbotService health check passed');
      } else {
        throw new Error('DeHubChatbotService not available');
      }
    } catch (error) {
      this.logger.error(`AI Service health check failed: ${error.message}`, error.stack);
      checks.aiService = 'error';
      errors.push(`AI Service Error: ${error.message}`);
      overallStatus = 'error';
      httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      serviceMode: 'dehub',
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
