import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger, ValidationPipe } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatbotSocketEvent } from './types';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ChatMessageDocument } from '../../models/ChatMessage';
import { GenerateImageDto } from './dto/generate-image.dto';
import { AnalyzeImageDto } from './dto/analyze-image.dto';
import { CustomUserRateLimitGuard, RateLimit } from './guards/custom-user-rate-limit.guard';
import { GetMessagesDto } from './dto/get-messages.dto';
import { ChatbotMetricsService } from './services/chatbot-metrics.service';

interface ChatbotResponse {
  conversationId: string;
  message: ChatMessageDocument;
}

interface ImageReadyResponse {
  conversationId: string;
  imageUrl: string;
  prompt: string;
}

interface AnalysisResponse {
  conversationId: string;
  message: ChatMessageDocument;
  analysis: string;
}

const validationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
  // exceptionFactory: (errors) => new WsException(errors), // İleride WsException için kullanılabilir
};

@WebSocketGateway({
  namespace: '/chatbot',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatbotGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatbotGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly chatbotMetricsService: ChatbotMetricsService,
  ) {}

  handleConnection(client: Socket) {
    this.chatbotMetricsService.incrementActiveConnections();
    const userAddress = client.handshake.query.address as string;
    if (!userAddress) {
      this.logger.error(`Client ${client.id} attempted to connect without an address`);
      this.chatbotMetricsService.incrementErrors();
      client.emit(ChatbotSocketEvent.ERROR, { 
        event: 'connection',
        code: 'ADDRESS_REQUIRED', 
        message: 'Address is required to connect', 
        timestamp: new Date().toISOString() 
      });
      client.disconnect();
      return;
    }
    this.logger.log(`Client connected to /chatbot namespace: ${client.id}, address: ${userAddress}`);
    client.data = { ...client.data, userAddress: userAddress.toLowerCase() }; // Adresi normalize ederek sakla
    client.join(userAddress.toLowerCase());
  }

  handleDisconnect(client: Socket) {
    this.chatbotMetricsService.decrementActiveConnections();
    const userAddress = client.data?.userAddress;
    this.logger.log(`Client disconnected from /chatbot namespace: ${client.id}, address: ${userAddress}`);
  }

  private formatError(event: string, error: any, defaultMessage: string) {
    this.chatbotMetricsService.incrementErrors();
    const message = error.response?.message || error.message || defaultMessage;
    const details = Array.isArray(error.response?.message) ? error.response.message.join(', ') : error.response?.message;
    return {
        event,
        code: error.status === 400 ? 'VALIDATION_ERROR' : error.status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
        timestamp: new Date().toISOString(),
        details: details
    };
  }

  @UseGuards(CustomUserRateLimitGuard)
  @RateLimit('chatbot-user-message')
  @SubscribeMessage(ChatbotSocketEvent.SEND_MESSAGE)
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe(validationPipeOptions)) payload: SendMessageDto,
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      // userAddress is checked by CustomUserRateLimitGuard.
      // If the guard is not present or address check is not performed, this if block would be required.
      // if (!userAddress) { ... }

      this.logger.debug(`Received message from ${userAddress}: ${payload.text} in conv ${payload.conversationId}`);
      client.emit(ChatbotSocketEvent.TYPING, { conversationId: payload.conversationId });
      const result = await this.chatbotService.handleIncomingMessage(userAddress, payload.conversationId, payload.text);
      return {
        event: ChatbotSocketEvent.MESSAGE_SENT_ACK,
        data: { status: 'processing', tempId: payload.tempId, messageId: result.messageId, conversationId: result.conversationId },
      };
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      const errorPayload = this.formatError(ChatbotSocketEvent.SEND_MESSAGE, error, 'Error processing message');
      client.emit(ChatbotSocketEvent.ERROR, errorPayload);
      return { event: ChatbotSocketEvent.ERROR, data: errorPayload }; // WsResponse için data içinde dönmek daha standart
    }
  }

  @UseGuards(CustomUserRateLimitGuard)
  @RateLimit('chatbot-user-image')
  @SubscribeMessage(ChatbotSocketEvent.GENERATE_IMAGE)
  async handleGenerateImage(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe(validationPipeOptions)) payload: GenerateImageDto,
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      this.logger.debug(`Received image generation request from ${userAddress}: ${payload.prompt} for conv ${payload.conversationId}`);
      const result = await this.chatbotService.requestImageGeneration(userAddress, payload.conversationId, payload);
      return {
        event: ChatbotSocketEvent.MESSAGE_SENT_ACK,
        data: { status: 'processing', message: 'Image generation started', conversationId: result.conversationId },
      };
    } catch (error) {
      this.logger.error(`Error processing image generation: ${error.message}`, error.stack);
      const errorPayload = this.formatError(ChatbotSocketEvent.GENERATE_IMAGE, error, 'Error generating image');
      client.emit(ChatbotSocketEvent.ERROR, errorPayload);
      return { event: ChatbotSocketEvent.ERROR, data: errorPayload };
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.CREATE_CONVERSATION) // Bu metod için rate limit eklenmemişti, şimdilik öyle kalıyor.
  async handleCreateConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe(validationPipeOptions)) payload: CreateConversationDto,
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      if (!userAddress) { // Bu endpoint rate limited olmadığı için adres kontrolü burada gerekli.
        this.logger.error('User address not found in socket connection for createConversation');
        const err = this.formatError(ChatbotSocketEvent.CREATE_CONVERSATION, { status: 401, message: 'Authentication context missing' }, 'Authentication context missing');
        client.emit(ChatbotSocketEvent.ERROR, err);
        return { event: ChatbotSocketEvent.ERROR, data: err };
      }
      const conversation = await this.chatbotService.createConversation(userAddress, payload.title);
      return {
        event: ChatbotSocketEvent.CONVERSATION_CREATED,
        data: conversation,
      };
    } catch (error) {
      this.logger.error(`Error creating conversation: ${error.message}`, error.stack);
      const errorPayload = this.formatError(ChatbotSocketEvent.CREATE_CONVERSATION, error, 'Failed to create conversation');
      client.emit(ChatbotSocketEvent.ERROR, errorPayload);
      return { event: ChatbotSocketEvent.ERROR, data: errorPayload };
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.GET_CONVERSATIONS)
  async handleGetConversations(@ConnectedSocket() client: Socket): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      if (!userAddress) { // Bu endpoint rate limited olmadığı için adres kontrolü burada gerekli.
        this.logger.error('User address not found in socket connection for getConversations');
        const err = this.formatError(ChatbotSocketEvent.GET_CONVERSATIONS, { status: 401, message: 'Authentication context missing' }, 'Authentication context missing');
        client.emit(ChatbotSocketEvent.ERROR, err);
        return { event: ChatbotSocketEvent.ERROR, data: err };
      }
      const conversations = await this.chatbotService.getConversationsForUser(userAddress);
      return {
        event: ChatbotSocketEvent.CONVERSATIONS_LIST,
        data: conversations,
      };
    } catch (error) {
      this.logger.error(`Error fetching conversations: ${error.message}`, error.stack);
      const errorPayload = this.formatError(ChatbotSocketEvent.GET_CONVERSATIONS, error, 'Failed to fetch conversations');
      client.emit(ChatbotSocketEvent.ERROR, errorPayload);
      return { event: ChatbotSocketEvent.ERROR, data: errorPayload };
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.GET_MESSAGES)
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe(validationPipeOptions)) payload: GetMessagesDto,
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      if (!userAddress) {
        this.logger.error('User address not found in socket connection for getMessages');
        const err = this.formatError(ChatbotSocketEvent.GET_MESSAGES, { status: 401, message: 'Authentication context missing' }, 'Authentication context missing');
        client.emit(ChatbotSocketEvent.ERROR, err);
        return { event: ChatbotSocketEvent.ERROR, data: err };
      }
      const messages = await this.chatbotService.getMessagesForConversation(userAddress, payload.conversationId);
      return {
        event: ChatbotSocketEvent.MESSAGES_LIST,
        data: { conversationId: payload.conversationId, messages },
      };
    } catch (error) {
      this.logger.error(`Error fetching messages: ${error.message}`, error.stack);
      const errorPayload = this.formatError(ChatbotSocketEvent.GET_MESSAGES, error, 'Failed to fetch messages');
      client.emit(ChatbotSocketEvent.ERROR, errorPayload);
      return { event: ChatbotSocketEvent.ERROR, data: errorPayload };
    }
  }

  @UseGuards(CustomUserRateLimitGuard)
  @RateLimit('chatbot-user-image')
  @SubscribeMessage(ChatbotSocketEvent.ANALYZE_IMAGE)
  async handleAnalyzeImage(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe(validationPipeOptions)) payload: AnalyzeImageDto,
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      this.logger.debug(`Received image analysis request from ${userAddress} in conversation ${payload.conversationId}`);
      const result = await this.chatbotService.requestImageAnalysis(userAddress, payload);
      return {
        event: ChatbotSocketEvent.MESSAGE_SENT_ACK,
        data: { status: 'processing', message: 'Image analysis started', conversationId: result.conversationId },
      };
    } catch (error) {
      this.logger.error(`Error processing image analysis: ${error.message}`, error.stack);
      const errorPayload = this.formatError(ChatbotSocketEvent.ANALYZE_IMAGE, error, 'Error analyzing image');
      client.emit(ChatbotSocketEvent.ERROR, errorPayload);
      return { event: ChatbotSocketEvent.ERROR, data: errorPayload };
    }
  }

  // Client'a mesaj gönderme fonksiyonları aynı kalacak...
  sendMessageToClient(userAddress: string, response: ChatbotResponse): void {
    try {
      this.server.to(userAddress).emit(ChatbotSocketEvent.STOP_TYPING, {
        conversationId: response.conversationId,
      });
      this.server.to(userAddress).emit(ChatbotSocketEvent.RECEIVE_MESSAGE, response);
      this.logger.debug(`Sent response to user ${userAddress} in conversation ${response.conversationId}`);
    } catch (error) {
      this.logger.error(`Error sending message to client ${userAddress}: ${error.message}`);
      this.chatbotMetricsService.incrementErrors();
    }
  }

  sendImageReadyToClient(userAddress: string, response: ImageReadyResponse): void {
    try {
      this.server.to(userAddress).emit(ChatbotSocketEvent.IMAGE_READY, response);
      this.logger.debug(`Sent image ready to user ${userAddress} in conversation ${response.conversationId}`);
    } catch (error) {
      this.logger.error(`Error sending image ready to client ${userAddress}: ${error.message}`);
      this.chatbotMetricsService.incrementErrors();
    }
  }

  sendImageErrorToClient(userAddress: string, response: { conversationId: string, error: string }): void {
    try {
      // Convert the error message to the standard format
      const errorPayload = this.formatError(ChatbotSocketEvent.IMAGE_ERROR, {message: response.error}, response.error);
      this.server.to(userAddress).emit(ChatbotSocketEvent.IMAGE_ERROR, {...errorPayload, conversationId: response.conversationId });
      this.logger.debug(`Sent image error to user ${userAddress} in conversation ${response.conversationId}: ${response.error}`);
    } catch (error) {
      this.logger.error(`Error sending image error to client ${userAddress}: ${error.message}`);
      this.chatbotMetricsService.incrementErrors();
    }
  }

  sendAnalysisToClient(userAddress: string, response: AnalysisResponse): void {
    try {
    this.server.to(userAddress).emit(ChatbotSocketEvent.ANALYSIS_COMPLETE, response);
    this.logger.debug(`Analysis sent to user ${userAddress}`);
    this.sendMessageToClient(userAddress, {
      conversationId: response.conversationId,
      message: response.message,
    });
    } catch (error) {
        this.logger.error(`Error sending analysis to client ${userAddress}: ${error.message}`);
        this.chatbotMetricsService.incrementErrors();
    }
  }

  sendAnalysisErrorToClient(userAddress: string, response: { conversationId: string, error: string }): void {
    try {
      // Convert the error message to the standard format
      const errorPayload = this.formatError(ChatbotSocketEvent.ANALYSIS_ERROR, {message: response.error}, response.error);
      this.server.to(userAddress).emit(ChatbotSocketEvent.ANALYSIS_ERROR, {...errorPayload, conversationId: response.conversationId });
    this.logger.debug(`Analysis error sent to user ${userAddress}`);
    } catch (error) {
      this.logger.error(`Error sending analysis error to client ${userAddress}: ${error.message}`);
      this.chatbotMetricsService.incrementErrors();
    }
  }
}