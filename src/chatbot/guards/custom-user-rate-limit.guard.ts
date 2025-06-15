import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Socket } from 'socket.io';
import { Request } from 'express';
import { ChatbotMetricsService } from '../services/chatbot-metrics.service';
import { ConfigService } from '@nestjs/config';

// Metadata keys
export const RATE_LIMIT_KEY = 'rate_limit_key';
export const RateLimit = (key: string) => SetMetadata(RATE_LIMIT_KEY, key);

interface RateLimitRecord {
  timestamps: number[];
}

// Basic in-memory store
// TODO: In production and high traffic, this in-memory store should be replaced with an external, 
// more scalable storage solution like Redis.
const userRequestStore = new Map<string, RateLimitRecord>();

@Injectable()
export class CustomUserRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(CustomUserRateLimitGuard.name);

  constructor(
    private reflector: Reflector,
    private chatbotMetricsService: ChatbotMetricsService,
    private configService: ConfigService,
  ) {}

  // Helper method to get limit configuration dynamically
  private getLimitConfig(key: string): { limit: number; ttl: number; description: string } | undefined {
    if (key === 'chatbot-user-message') {
      return {
        limit: this.configService.get<number>('CHATBOT_USER_MESSAGE_LIMIT', 20), // Default 20
        ttl: this.configService.get<number>('CHATBOT_USER_MESSAGE_TTL_MS', 60 * 1000), // Default 1 min
        description: 'User messages',
      };
    } else if (key === 'chatbot-user-image') {
      return {
        limit: this.configService.get<number>('CHATBOT_USER_IMAGE_LIMIT', 5), // Default 5
        ttl: this.configService.get<number>('CHATBOT_USER_IMAGE_TTL_MS', 60 * 60 * 1000), // Default 1 hour
        description: 'User image requests',
      };
    }
    return undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    const rateLimitKey = this.reflector.get<string>(RATE_LIMIT_KEY, context.getHandler());
    
    const config = rateLimitKey ? this.getLimitConfig(rateLimitKey) : undefined;

    if (!config) {
      this.logger.warn(
        `Rate limit key '${rateLimitKey}' not configured or invalid for handler: ${context.getClass().name}.${context.getHandler().name}. Allowing request by default.`,
      );
      return true; 
    }

    const { limit, ttl, description } = config;

    let userAddress: string | undefined;
    const type = context.getType<'http' | 'ws'>();
    let clientSocket: Socket | undefined;

    if (type === 'ws') {
      clientSocket = context.switchToWs().getClient<Socket>();
      userAddress = clientSocket.data?.userAddress;
    } else if (type === 'http') {
      const request = context.switchToHttp().getRequest<Request>();
      // TODO: HTTP address retrieval method should be improved with AuthGuard. The current method is not secure for production.
      userAddress = request.query?.address as string || 
                    request.body?.address as string || 
                    request.params?.address as string;
    }

    if (!userAddress) {
      this.logger.warn(`User address not found for rate limiting on '${description}'. Request denied.`);
      if (type === 'ws' && clientSocket) {
        this.chatbotMetricsService.incrementErrors(); 
        clientSocket.emit('error', { 
          event: rateLimitKey || 'rate_limit_config_error', 
          code: 'ADDRESS_REQUIRED_FOR_LIMIT',
          message: 'User address is required to apply rate limits.',
          timestamp: new Date().toISOString(),
          details: `Rate limit configuration key: ${rateLimitKey}`
        });
        return false; 
      }
      this.chatbotMetricsService.incrementErrors(); 
      throw new HttpException('User address is required for this operation.', HttpStatus.BAD_REQUEST);
    }
    
    const normalizedUserAddress = userAddress.toLowerCase(); // Address normalization

    const now = Date.now();
    let record = userRequestStore.get(normalizedUserAddress);

    if (!record) {
      record = { timestamps: [] };
      userRequestStore.set(normalizedUserAddress, record);
    }

    // Clean up old timestamps outside the valid time range
    record.timestamps = record.timestamps.filter(ts => now - ts < ttl);

    if (record.timestamps.length >= limit) {
      this.logger.warn(
        `Rate limit exceeded for user '${normalizedUserAddress}' on '${description}'. Limit: ${limit}/${ttl}ms. Requests: ${record.timestamps.length}`,
      );
      this.chatbotMetricsService.incrementCustomRateLimitBlocks(); 

      let retryAfterSeconds = 1; // Default fallback
      if (record.timestamps.length > 0) {
        const oldestRequestTime = record.timestamps[0];
        const windowEndTime = oldestRequestTime + ttl;
        const waitMilliseconds = windowEndTime - now;
        retryAfterSeconds = Math.max(1, Math.ceil(waitMilliseconds / 1000)); // En az 1 saniye
      }

      if (type === 'ws' && clientSocket) {
        clientSocket.emit('error', { 
          event: rateLimitKey,
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded for ${description}. Please try again later.`,
          timestamp: new Date().toISOString(),
          details: `Limit: ${limit} requests per ${ttl / 1000} seconds. Current: ${record.timestamps.length}`,
          retryAfterSeconds,
        });
        return false;
      }
      throw new HttpException(
        { 
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Rate limit exceeded for ${description}. Please try again later.`,
            error: "Too Many Requests",
            details: `Limit: ${limit} requests per ${ttl / 1000} seconds. Current: ${record.timestamps.length}`,
            retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);

    this.logger.debug(
        `Request allowed for user '${normalizedUserAddress}' on '${description}'. Count: ${record.timestamps.length}/${limit}`
    );
    return true;
  }
} 