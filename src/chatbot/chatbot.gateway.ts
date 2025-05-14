import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect,
  WsResponse
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './send-message.dto';
import { SocketEvent } from './types';
import { Logger } from '@nestjs/common';

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

  @WebSocketServer()
  server: Server;

  constructor(private readonly chatbotService: ChatbotService) {}

  handleConnection(client: Socket) {
    const userAddress = client.handshake.query.address;
    this.logger.log(`Client connected to /chatbot namespace: ${client.id}, address: ${userAddress}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from /chatbot namespace: ${client.id}`);
  }

  @SubscribeMessage(SocketEvent.sendMessage)
  async handleMessage(client: Socket, payload: SendMessageDto): Promise<WsResponse<any>> {
    // Kullanıcı verisi kontrolü
    if (!client.data || !client.data.user) {
      this.logger.error('User data not found in socket connection');
      client.emit(SocketEvent.error, { message: 'Authentication required' });
      return {
        event: 'error',
        data: { status: 'error', message: 'Authentication required' }
      };
    }

    try {
      const user = client.data.user;
      
      this.logger.debug(`Received message from ${user.address}: ${payload.text}`);
      
      // Emit typing event to indicate the AI is processing
      this.server.to(client.id).emit(SocketEvent.typing);
      
      // Process the message with the chatbot service
      const result = await this.chatbotService.handleIncomingMessage(user.id, payload, client.id);
      
      // Simulate processing delay (will be replaced with actual AI processing time in future phases)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate a response (this will be done by AI in future phases)
      const response = {
        text: `You said: ${payload.text}`,
        timestamp: new Date().toISOString()
      };
      
      // Stop typing indicator and send response
      this.server.to(client.id).emit(SocketEvent.stopTyping);
      this.server.to(client.id).emit(SocketEvent.receiveResponse, response);
      
      // We don't return anything here because responses are sent via emits
      return {
        event: 'acknowledge',
        data: { status: 'processing' }
      };
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`);
      client.emit(SocketEvent.error, { message: 'Error processing message' });
      return {
        event: 'error',
        data: { status: 'error', message: 'Internal server error' }
      };
    }
  }
} 