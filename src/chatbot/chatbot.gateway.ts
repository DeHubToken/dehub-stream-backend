import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect,
  WsResponse,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './send-message.dto';
import { ChatbotSocketEvent } from './types';
import { Logger } from '@nestjs/common';
import { CreateConversationDto } from './create-conversation.dto';
import { ChatMessageDocument } from '../../models/ChatMessage';



interface ChatbotResponse {
  conversationId: string;
  message: ChatMessageDocument;
}

@WebSocketGateway({
  namespace: '/chatbot',
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
    credentials: true,
  },
})
//@UseGuards(WsGuard) TODO: add guard
export class ChatbotGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatbotGateway.name);
  private readonly clients = new Map<string, Socket>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly chatbotService: ChatbotService) {}

  handleConnection(client: Socket) {
    const userAddress = client.handshake.query.address as string;
    
    // Temporary authentication logic - just verify address exists
    // In a real implementation, verify the address matches a valid user
    if (!userAddress) {
      this.logger.error(`Client ${client.id} attempted to connect without an address`);
      client.emit(ChatbotSocketEvent.ERROR, { message: 'Address is required to connect' });
      client.disconnect();
      return;
    }
    
    this.logger.log(`Client connected to /chatbot namespace: ${client.id}, address: ${userAddress}`);
    
    // Store the user address in the client data
    client.data = { ...client.data, userAddress };
    
    // Store client reference for direct messaging
    this.clients.set(userAddress, client);
    
    // Join a room specific to this user's address
    client.join(userAddress);
  }

  handleDisconnect(client: Socket) {
    const userAddress = client.data?.userAddress;
    this.logger.log(`Client disconnected from /chatbot namespace: ${client.id}`);
    
    if (userAddress) {
      this.clients.delete(userAddress);
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.SEND_MESSAGE)
  async handleMessage(
    @ConnectedSocket() client: Socket, 
    @MessageBody() payload: SendMessageDto
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      
      if (!userAddress) {
        this.logger.error('User address not found in socket connection');
        client.emit(ChatbotSocketEvent.ERROR, { message: 'Authentication required' });
        return {
          event: ChatbotSocketEvent.ERROR,
          data: { status: 'error', message: 'Authentication required' }
        };
      }
      
      this.logger.debug(`Received message from ${userAddress}: ${payload.text}`);
      
      // Emit typing event to indicate the AI is processing
      client.emit(ChatbotSocketEvent.TYPING, { conversationId: payload.conversationId });
      
      // Process the message with the chatbot service
      const result = await this.chatbotService.handleIncomingMessage(
        userAddress,
        payload.conversationId,
        payload.text,
      );
      
      // Acknowledge that the message was received and is being processed
      return {
        event: ChatbotSocketEvent.MESSAGE_SENT_ACK,
        data: { 
          status: 'processing', 
          tempId: payload.tempId,
          conversationId: result.conversationId
        }
      };
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`);
      client.emit(ChatbotSocketEvent.ERROR, { message: 'Error processing message' });
      return {
        event: ChatbotSocketEvent.ERROR,
        data: { status: 'error', message: 'Internal server error' }
      };
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.CREATE_CONVERSATION)
  async handleCreateConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CreateConversationDto
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      
      if (!userAddress) {
        client.emit(ChatbotSocketEvent.ERROR, { message: 'Authentication required' });
        return {
          event: ChatbotSocketEvent.ERROR,
          data: { status: 'error', message: 'Authentication required' }
        };
      }
      
      const conversation = await this.chatbotService.createConversation(userAddress, payload.title);
      
      return {
        event: ChatbotSocketEvent.CONVERSATION_CREATED,
        data: conversation
      };
    } catch (error) {
      this.logger.error(`Error creating conversation: ${error.message}`);
      return {
        event: ChatbotSocketEvent.ERROR,
        data: { status: 'error', message: 'Failed to create conversation' }
      };
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.GET_CONVERSATIONS)
  async handleGetConversations(
    @ConnectedSocket() client: Socket
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      
      if (!userAddress) {
        client.emit(ChatbotSocketEvent.ERROR, { message: 'Authentication required' });
        return {
          event: ChatbotSocketEvent.ERROR,
          data: { status: 'error', message: 'Authentication required' }
        };
      }
      
      const conversations = await this.chatbotService.getConversationsForUser(userAddress);
      
      return {
        event: ChatbotSocketEvent.CONVERSATIONS_LIST,
        data: conversations
      };
    } catch (error) {
      this.logger.error(`Error fetching conversations: ${error.message}`);
      return {
        event: ChatbotSocketEvent.ERROR,
        data: { status: 'error', message: 'Failed to fetch conversations' }
      };
    }
  }

  @SubscribeMessage(ChatbotSocketEvent.GET_MESSAGES)
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string }
  ): Promise<WsResponse<any>> {
    try {
      const userAddress = client.data?.userAddress;
      
      if (!userAddress) {
        client.emit(ChatbotSocketEvent.ERROR, { message: 'Authentication required' });
        return {
          event: ChatbotSocketEvent.ERROR,
          data: { status: 'error', message: 'Authentication required' }
        };
      }
      
      const messages = await this.chatbotService.getMessagesForConversation(
        userAddress,
        payload.conversationId
      );
      
      return {
        event: ChatbotSocketEvent.MESSAGES_LIST,
        data: {
          conversationId: payload.conversationId,
          messages
        }
      };
    } catch (error) {
      this.logger.error(`Error fetching messages: ${error.message}`);
      return {
        event: ChatbotSocketEvent.ERROR,
        data: { status: 'error', message: 'Failed to fetch messages' }
      };
    }
  }

  /**
   * Sends a message to a specific client by their address
   */
  sendMessageToClient(userAddress: string, response: ChatbotResponse): void {
    try {
      // Stop typing indicator
      this.server.to(userAddress).emit(ChatbotSocketEvent.STOP_TYPING, {
        conversationId: response.conversationId
      });
      
      // Send the actual message
      this.server.to(userAddress).emit(ChatbotSocketEvent.RECEIVE_MESSAGE, response);
      
      this.logger.debug(`Sent response to user ${userAddress} in conversation ${response.conversationId}`);
    } catch (error) {
      this.logger.error(`Error sending message to client ${userAddress}: ${error.message}`);
    }
  }
} 