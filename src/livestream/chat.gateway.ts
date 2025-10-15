import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
// import { ChatService } from './chat.service';
import { BadRequestException, forwardRef, Inject, UseGuards, Logger } from '@nestjs/common';
import { WsAuthGuard } from 'common/guards/ws.guard';
import { StreamChatService } from './chat.service';
import { LivestreamService } from './livestream.service';
import * as fs from 'fs';
import * as path from 'path';
import { HlsService } from './hls.service';
import { LivestreamEvents } from './enums/livestream.enum';
import { StreamStatus } from 'config/constants';
import { ConnectionService } from './connection.service';
import { Interval } from '@nestjs/schedule';

@WebSocketGateway({
  cors: {
    origin: '*',
    path: '/socket.io',
    credentials: true,
  },
  pingInterval: 10000, // 10 seconds
  pingTimeout: 5000, // 5 seconds
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly reconnectTimeout = 30000; // 30 seconds
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly logger = new Logger('ChatGateway');

  constructor(
    private chatService: StreamChatService,
    @Inject(forwardRef(() => LivestreamService))
    private livestreamService: LivestreamService,
    private readonly hlsService: HlsService,
    private readonly connectionService: ConnectionService,
  ) {}

  private tempStorage: { [key: string]: fs.WriteStream } = {};

  afterInit(server: Server) {
    this.logger.log('[ChatGateway.afterInit] WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`[ChatGateway.handleConnection] clientId=${client.id} attempting connection`);

      // Handle both auth methods (auth object and query params)
      const authUser = client.handshake.auth?.user;
      const queryAddress = client.handshake.query?.address as string;

      // If no auth user but has address in query, create basic user object
      const user = authUser || (queryAddress ? { address: queryAddress } : null);

      if (!user) {
        this.logger.warn(
          `[ChatGateway.handleConnection] clientId=${client.id} connected WITHOUT authentication (anonymous)`,
        );
        // Don't disconnect - allow anonymous connections
        client.data.user = { address: null, isAnonymous: true };
        return;
      }

      client.data.user = {
        ...user,
        isAnonymous: false,
      };

      this.logger.log(
        `[ChatGateway.handleConnection] clientId=${client.id} connected as ${user.username || user.address}`,
      );

      // Track connection in Redis only for authenticated users
      if (user.address) {
        await this.connectionService.trackConnection(client.id, user.address);

        // Clear any pending disconnect timer
        const disconnectTimer = this.disconnectTimers.get(user.address);
        if (disconnectTimer) {
          clearTimeout(disconnectTimer);
          this.disconnectTimers.delete(user.address);
        }

        // Restore user sessions
        await this.restoreUserSession(client, user);

        // Emit online users update
        this.emitOnlineUsers();
      }
    } catch (error) {
      this.logger.error(`[ChatGateway.handleConnection] clientId=${client.id} error: ${error?.message}`, error?.stack);
      // Don't disconnect on error, just log it
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = client.data.user;
      if (!user || user.isAnonymous) {
        return;
      }
      this.logger.log(`[ChatGateway.handleDisconnect] clientId=${client.id} address=${user.address} disconnected`);

      // Set a timer for final cleanup if no reconnection occurs
      const timer = setTimeout(async () => {
        await this.handleFinalDisconnect(client, user);
        this.disconnectTimers.delete(user.address);
        // Emit online users update after disconnect
        this.emitOnlineUsers();
      }, this.reconnectTimeout);

      this.disconnectTimers.set(user.address, timer);

      // Remove the connection from tracking
      await this.connectionService.removeConnection(client.id, user.address);
    } catch (error) {
      this.logger.error(`[ChatGateway.handleDisconnect] clientId=${client.id} error: ${error?.message}`, error?.stack);
    }
  }

  private async emitOnlineUsers() {
    try {
      // Get all unique user addresses from active connections
      const sockets = await this.server.sockets.sockets;
      const onlineUsers = Array.from(sockets.values())
        .map(socket => socket.data.user?.address)
        .filter(address => address) // Filter out null/undefined addresses
        .filter((address, index, self) => self.indexOf(address) === index); // Remove duplicates

      // Emit to all connected clients
      this.logger.debug(`[ChatGateway.emitOnlineUsers] emitting update-online-users count=${onlineUsers.length}`);
      this.server.emit('update-online-users', onlineUsers);
    } catch (error) {
      this.logger.error(`[ChatGateway.emitOnlineUsers] error: ${error?.message}`, error?.stack);
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    try {
      const user = client.data.user;
      if (user?.address) {
        // Ensure the connection is tracked (handles cases where auth happened after connection)
        const isActive = await this.connectionService.isConnectionActive(client.id);
        if (!isActive) {
          await this.connectionService.trackConnection(client.id, user.address);
        }
        await this.connectionService.updateHeartbeat(client.id);

        // Echo heartbeat back to the client for frontend listener
        const payload = { clientId: client.id, address: user.address, serverTs: Date.now() };
        this.logger.debug(
          `[ChatGateway.handleHeartbeat] echo -> heartbeat clientId=${client.id} address=${user.address}`,
        );
        client.emit('heartbeat', payload);
      }
    } catch (error) {
      this.logger.error(`[ChatGateway.handleHeartbeat] clientId=${client.id} error: ${error?.message}`, error?.stack);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.EndStream)
  async handleEndStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    this.logger.log(
      `[ChatGateway.handleEndStream] clientId=${client.id} address=${client?.data?.user?.address} streamId=${data?.streamId}`,
    );
    await this.livestreamService.endStream(data.streamId, client.data.user.address);
    this.logger.debug(
      `[ChatGateway.handleEndStream] emit -> ${LivestreamEvents.EndStream} room=stream:${data.streamId}`,
    );
    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.EndStream, {
      streamId: data.streamId,
    });
    await client.leave(`stream:${data.streamId}`);
    await this.hlsService.cleanupStream(data.streamId);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.JoinRoom)
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    this.logger.log(
      `[ChatGateway.handleJoinRoom] clientId=${client.id} address=${client?.data?.user?.address} join room stream:${data?.streamId}`,
    );
    await client.join(`stream:${data.streamId}`);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.JoinStream)
  async handleJoinStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    try {
      const user = client.data.user;
      if (!user?.address) return;
      this.logger.log(
        `[ChatGateway.handleJoinStream] clientId=${client.id} address=${user.address} streamId=${data?.streamId}`,
      );

      // If already an active viewer, ensure socket is in room but do not bump counts or emit
      const alreadyActive = await this.connectionService.isViewerActive(data.streamId, user.address);
      if (alreadyActive) {
        this.logger.debug(
          `[ChatGateway.handleJoinStream] address=${user.address} already active in streamId=${data.streamId}; skipping re-join side-effects`,
        );
        await client.join(`stream:${data.streamId}`);
        return;
      }

      await client.join(`stream:${data.streamId}`);

      // Track viewer in Redis
      await this.connectionService.trackViewer(data.streamId, user.address);

      // Add viewer to database
      await this.livestreamService.addViewer(data.streamId, user.address);

      const viewerCount = await this.livestreamService.getViewerCount(data.streamId);

      this.logger.debug(
        `[ChatGateway.handleJoinStream] emit -> ${LivestreamEvents.JoinStream} room=stream:${data.streamId} viewerCount=${viewerCount}`,
      );
      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.JoinStream, {
        viewerCount,
        user: { address: user.address, username: user.username || user.address },
      });

      this.logger.debug(
        `[ChatGateway.handleJoinStream] emit -> ${LivestreamEvents.ViewCountUpdate} room=stream:${data.streamId} viewerCount=${viewerCount}`,
      );
      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.ViewCountUpdate, {
        viewerCount,
      });
    } catch (error) {
      this.logger.error(`[ChatGateway.handleJoinStream] clientId=${client.id} error: ${error?.message}`, error?.stack);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.LeaveStream)
  async handleLeaveStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    try {
      const user = client.data.user;
      if (!user?.address) return;

      // Check if user is actually active in the stream
      const isActive = await this.connectionService.isViewerActive(data.streamId, user.address);
      if (!isActive) {
        this.logger.warn(
          `[ChatGateway.handleLeaveStream] address=${user.address} already left streamId=${data.streamId}`,
        );
        return;
      }

      await client.leave(`stream:${data.streamId}`);

      // Remove viewer from Redis
      await this.connectionService.removeViewer(data.streamId, user.address);

      // Remove viewer from database
      await this.livestreamService.removeViewer(data.streamId, user.address);

      const viewerCount = await this.livestreamService.getViewerCount(data.streamId);

      this.logger.debug(
        `[ChatGateway.handleLeaveStream] emit -> ${LivestreamEvents.LeaveStream} room=stream:${data.streamId} viewerCount=${viewerCount}`,
      );
      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.LeaveStream, {
        viewerCount,
        user: { address: user.address, username: user.username || user.address },
      });

      this.logger.debug(
        `[ChatGateway.handleLeaveStream] emit -> ${LivestreamEvents.ViewCountUpdate} room=stream:${data.streamId} viewerCount=${viewerCount}`,
      );
      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.ViewCountUpdate, {
        viewerCount,
      });
    } catch (error) {
      this.logger.error(`[ChatGateway.handleLeaveStream] clientId=${client.id} error: ${error?.message}`, error?.stack);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.SendMessage)
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; content: string },
  ) {
    const user = client.data.user;

    const message = await this.chatService.addChatMessage(data.streamId, user.address, data.content, {});
    this.logger.debug(
      `[ChatGateway.handleChatMessage] emit -> ${LivestreamEvents.SendMessage} room=stream:${data.streamId} from=${user.address}`,
    );
    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.SendMessage, {
      message: { ...message, user: { address: user.address, username: user.username || user.address } },
    });
  }

  // @UseGuards(WsAuthGuard)
  // @SubscribeMessage(LivestreamEvents.LikeStream)
  // async handleLikeStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
  //   const user = client.data.user;
  //   const like = await this.livestreamService.likeStream(data.streamId, user.address);
  //   await this.chatService.likeStream(data.streamId, user.address);

  //   this.server.emit(LivestreamEvents.LikeStream, { streamId: data.streamId });
  //   // this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.LikeStream, {
  //   //   ...like,
  //   //   user: { address: user.address, username: user.username || user.address },
  //   // });
  // }

  private async restoreUserSession(client: Socket, user: any) {
    // Get active sessions for user
    const activeSessions = await this.connectionService.getUserActiveSessions(user.address);

    if (activeSessions.length > 0) {
      this.logger.log(
        `[ChatGateway.restoreUserSession] address=${user.address} restoring sessions count=${activeSessions.length}`,
      );

      // Restore stream sessions
      const activeStream = await this.livestreamService.getActiveStreamByUser(user.address);
      if (activeStream) {
        this.logger.log(
          `[ChatGateway.restoreUserSession] address=${user.address} restoring streamer room stream:${activeStream.id}`,
        );
        await client.join(`stream:${activeStream.id}`);
      }

      // Restore viewer sessions
      const activeViewStreams = await this.livestreamService.getStreamsByViewer(user.address);
      for (const stream of activeViewStreams) {
        this.logger.log(
          `[ChatGateway.restoreUserSession] address=${user.address} restoring viewer room stream:${stream.id}`,
        );
        await this.handleJoinStream(client, { streamId: stream.id });
      }
    }
  }

  private isUserStillConnected(address: string): boolean {
    return Array.from(this.server.sockets.sockets.values()).some(socket => socket.data?.user?.address === address);
  }

  private async convertToViewer(client: Socket, streamId: string) {
    // Placeholder function for later implementation
    console.log(`User ${client.data.user.address} converting to viewer after stream end.`);
  }

  @Interval(30000) // Run every 30 seconds
  async cleanupStaleConnections() {
    try {
      // Get all active connections
      const sockets = await this.server.sockets.sockets;

      for (const [clientId, socket] of sockets.entries()) {
        const user = socket.data.user;
        if (!user?.address) continue;

        // Check if connection is still active in Redis
        const isActive = await this.connectionService.isConnectionActive(clientId);
        if (!isActive) {
          this.logger.warn(
            `[ChatGateway.cleanupStaleConnections] cleaning stale connection clientId=${clientId} address=${user.address}`,
          );
          await this.handleFinalDisconnect(socket, user);
        }
      }
    } catch (error) {
      this.logger.error(`[ChatGateway.cleanupStaleConnections] error: ${error?.message}`, error?.stack);
    }
  }

  private async handleFinalDisconnect(client: Socket, user: any) {
    try {
      // Check if user was streaming
      const activeStream = await this.livestreamService.getActiveStreamByUser(user.address);
      if (activeStream) {
        this.logger.warn(
          `[ChatGateway.handleFinalDisconnect] streamer address=${user.address} disconnected streamId=${activeStream.id} (Livepeer webhook will end if no reconnection)`,
        );
        // Leave the stream room but don't end the stream - Livepeer webhook will handle that
        await client.leave(`stream:${activeStream.id}`);
      }

      // Handle viewers leaving streams
      const activeViewStreams = await this.livestreamService.getStreamsByViewer(user.address);
      for (const stream of activeViewStreams) {
        await this.handleLeaveStream(client, { streamId: stream.id });
      }

      // Clean up all user sessions
      await this.connectionService.cleanupUserSessions(user.address);
    } catch (error) {
      this.logger.error(
        `[ChatGateway.handleFinalDisconnect] clientId=${client.id} address=${user?.address} error: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
