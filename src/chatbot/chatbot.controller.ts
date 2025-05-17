import { Controller, Get, Post, Body, UseGuards, Req, Query, Param, NotFoundException, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './send-message.dto';
import { AuthGuard } from 'common/guards/auth.guard';
import { CreateConversationDto } from './create-conversation.dto';

/**
 * Controller for HTTP endpoints for the chatbot
 * Note: WebSocket communication via ChatbotGateway is the primary method for chatbot interaction
 * These HTTP endpoints provide alternative access for testing and integrations
 */
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  /**
   * Get all conversations for a user
   * @param address User's blockchain address
   */
  @Get()
  async getUserConversations(@Query('address') address: string) {
    // Temporary auth check - will be replaced with proper auth in the future
    if (!address) {
      throw new BadRequestException('Address parameter is required');
    }

    // In a production app, we would verify that the address is valid
    // TODO: Add proper authentication

    return this.chatbotService.getConversationsForUser(address);
  }

  /**
   * Create a new conversation
   */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @Query('address') address: string,
    @Body() createConversationDto: CreateConversationDto
  ) {
    // Temporary auth check
    if (!address) {
      throw new BadRequestException('Address parameter is required');
    }

    return this.chatbotService.createConversation(address, createConversationDto.title);
  }

  /**
   * Get messages for a specific conversation
   */
  @Get('conversations/:conversationId/messages')
  async getConversationMessages(
    @Query('address') address: string,
    @Param('conversationId') conversationId: string
  ) {
    // Temporary auth check
    if (!address) {
      throw new BadRequestException('Address parameter is required');
    }

    try {
      return await this.chatbotService.getMessagesForConversation(address, conversationId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Send a message to a conversation
   */
  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Query('address') address: string,
    @Param('conversationId') conversationId: string,
    @Body() sendMessageDto: SendMessageDto
  ) {
    // Temporary auth check
    if (!address) {
      throw new BadRequestException('Address parameter is required');
    }

    try {
      // Process the incoming message
      const result = await this.chatbotService.handleIncomingMessage(
        address,
        conversationId,
        sendMessageDto.text,
      );

      return {
        success: true,
        message: 'Message received and queued for processing',
        messageId: result.messageId,
        conversationId: result.conversationId
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }
} 