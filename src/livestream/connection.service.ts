import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class ConnectionService {
  private readonly HEARTBEAT_EXPIRY = 30; // seconds
  private readonly CONNECTION_KEY_PREFIX = 'ws:connection:';
  private readonly USER_SESSIONS_PREFIX = 'ws:user:';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async trackConnection(clientId: string, userId: string) {
    const multi = this.redis.multi();
    
    // Track client connection
    multi.setex(
      `${this.CONNECTION_KEY_PREFIX}${clientId}`,
      this.HEARTBEAT_EXPIRY,
      userId
    );
    
    // Add to user's session set
    multi.sadd(`${this.USER_SESSIONS_PREFIX}${userId}`, clientId);
    
    await multi.exec();
  }

  async removeConnection(clientId: string, userId: string) {
    const multi = this.redis.multi();
    
    // Remove connection tracking
    multi.del(`${this.CONNECTION_KEY_PREFIX}${clientId}`);
    
    // Remove from user's session set
    multi.srem(`${this.USER_SESSIONS_PREFIX}${userId}`, clientId);
    
    await multi.exec();
  }

  async updateHeartbeat(clientId: string) {
    await this.redis.expire(
      `${this.CONNECTION_KEY_PREFIX}${clientId}`,
      this.HEARTBEAT_EXPIRY
    );
  }

  async getUserActiveSessions(userId: string): Promise<string[]> {
    return this.redis.smembers(`${this.USER_SESSIONS_PREFIX}${userId}`);
  }

  async isConnectionActive(clientId: string): Promise<boolean> {
    const exists = await this.redis.exists(`${this.CONNECTION_KEY_PREFIX}${clientId}`);
    return exists === 1;
  }

  async cleanupUserSessions(userId: string) {
    const sessions = await this.getUserActiveSessions(userId);
    
    if (sessions.length === 0) return;

    const multi = this.redis.multi();
    
    // Remove all connection records
    for (const clientId of sessions) {
      multi.del(`${this.CONNECTION_KEY_PREFIX}${clientId}`);
    }
    
    // Remove user's session set
    multi.del(`${this.USER_SESSIONS_PREFIX}${userId}`);
    
    await multi.exec();
  }
} 