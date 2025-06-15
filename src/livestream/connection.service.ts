import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class ConnectionService {
  private readonly HEARTBEAT_EXPIRY = 60; 
  private readonly CONNECTION_KEY_PREFIX = 'ws:connection:';
  private readonly USER_SESSIONS_PREFIX = 'ws:user:';
  private readonly VIEWER_PREFIX = 'stream:viewer:';

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
    try {
      const userId = await this.redis.get(`${this.CONNECTION_KEY_PREFIX}${clientId}`);
      if (!userId) {
        console.warn(`No user found for client ${clientId} during heartbeat update`);
        return;
      }

      const multi = this.redis.multi();
      
      // Update connection expiry
      multi.expire(
        `${this.CONNECTION_KEY_PREFIX}${clientId}`,
        this.HEARTBEAT_EXPIRY
      );

      // Update any active viewer sessions
      const viewerKeys = await this.redis.keys(`${this.VIEWER_PREFIX}*:${userId}`);
      for (const key of viewerKeys) {
        multi.expire(key, this.HEARTBEAT_EXPIRY);
      }

      await multi.exec();
    } catch (error) {
      console.error('Error updating heartbeat:', error);
    }
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

    // Remove any viewer records
    const viewerKeys = await this.redis.keys(`${this.VIEWER_PREFIX}*:${userId}`);
    for (const key of viewerKeys) {
      multi.del(key);
    }
    
    await multi.exec();
  }

  async trackViewer(streamId: string, userId: string) {
    const key = `${this.VIEWER_PREFIX}${streamId}:${userId}`;
    await this.redis.setex(key, this.HEARTBEAT_EXPIRY, '1');
  }

  async removeViewer(streamId: string, userId: string) {
    const key = `${this.VIEWER_PREFIX}${streamId}:${userId}`;
    await this.redis.del(key);
  }

  async isViewerActive(streamId: string, userId: string): Promise<boolean> {
    const key = `${this.VIEWER_PREFIX}${streamId}:${userId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }
} 