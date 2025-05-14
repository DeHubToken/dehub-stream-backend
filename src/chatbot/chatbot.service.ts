import { Injectable, Logger } from '@nestjs/common';
import { SendMessageDto } from './send-message.dto';
import { SocketEvent } from './types';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  /**
   * Handle incoming messages from users
   * 
   * In future phases, this will connect to AI services
   */
  async handleIncomingMessage(userId: string, messageDto: SendMessageDto, socketId: string = null) {
    this.logger.log(`Received message from user ${userId}: ${messageDto.text}`);
    
    // For HTTP requests without a socket ID, just return the response
    if (!socketId) {
      return {
        success: true,
        message: 'Message processed',
        response: {
          text: `You said: ${messageDto.text}`,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // The actual WebSocket response will be emitted in the gateway
    return {
      success: true,
      message: 'Message received',
      userId,
      text: messageDto.text,
      socketId
    };
  }
} 