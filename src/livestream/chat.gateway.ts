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
import { BadRequestException, forwardRef, Inject, UseGuards } from '@nestjs/common';
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

  constructor(
    private chatService: StreamChatService,
    @Inject(forwardRef(() => LivestreamService))
    private livestreamService: LivestreamService,
    private readonly hlsService: HlsService,
    private readonly connectionService: ConnectionService,
  ) {}

  private tempStorage: { [key: string]: fs.WriteStream } = {};

  afterInit(server: Server) {
    console.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      console.log(`Client attempting connection: ${client.id}`);

      // Handle both auth methods (auth object and query params)
      const authUser = client.handshake.auth?.user;
      const queryAddress = client.handshake.query?.address as string;

      // If no auth user but has address in query, create basic user object
      const user = authUser || (queryAddress ? { address: queryAddress } : null);

      if (!user) {
        console.log(`Client ${client.id} connected without authentication`);
        // Don't disconnect - allow anonymous connections
        client.data.user = { address: null, isAnonymous: true };
        return;
      }

      client.data.user = {
        ...user,
        isAnonymous: false,
      };

      console.log(`User connected: ${user.username || user.address}`);

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
      console.error('Error in handleConnection:', error);
      // Don't disconnect on error, just log it
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = client.data.user;
      if (!user || user.isAnonymous) {
        return;
      }

      console.log(`Client disconnected: ${client.id} -- ${user.address}`);

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
      console.error('Error in handleDisconnect:', error);
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
      this.server.emit('update-online-users', onlineUsers);
    } catch (error) {
      console.error('Error emitting online users:', error);
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
      }
    } catch (error) {
      console.error('Error in handleHeartbeat:', error);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.EndStream)
  async handleEndStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    console.log('Ending stream');
    await this.livestreamService.endStream(data.streamId, client.data.user.address);
    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.EndStream, {
      streamId: data.streamId,
    });
    await client.leave(`stream:${data.streamId}`);
    await this.hlsService.cleanupStream(data.streamId);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.JoinRoom)
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    console.log('Joining room:', data.streamId);
    await client.join(`stream:${data.streamId}`);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.JoinStream)
  async handleJoinStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    try {
      const user = client.data.user;
      if (!user?.address) return;

      console.log('Joining stream:', data.streamId);
      await client.join(`stream:${data.streamId}`);

      // Track viewer in Redis
      await this.connectionService.trackViewer(data.streamId, user.address);

      // Add viewer to database
      await this.livestreamService.addViewer(data.streamId, user.address);

      const viewerCount = await this.livestreamService.getViewerCount(data.streamId);

      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.JoinStream, {
        viewerCount,
        user: { address: user.address, username: user.username || user.address },
      });

      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.ViewCountUpdate, {
        viewerCount,
      });
    } catch (error) {
      console.error('Error in handleJoinStream:', error);
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
        console.log(`User ${user.address} already left stream ${data.streamId}`);
        return;
      }

      await client.leave(`stream:${data.streamId}`);

      // Remove viewer from Redis
      await this.connectionService.removeViewer(data.streamId, user.address);

      // Remove viewer from database
      await this.livestreamService.removeViewer(data.streamId, user.address);

      const viewerCount = await this.livestreamService.getViewerCount(data.streamId);

      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.LeaveStream, {
        viewerCount,
        user: { address: user.address, username: user.username || user.address },
      });

      this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.ViewCountUpdate, {
        viewerCount,
      });
    } catch (error) {
      console.error('Error in handleLeaveStream:', error);
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
      console.log(`Restoring sessions for user ${user.address}`);

      // Restore stream sessions
      const activeStream = await this.livestreamService.getActiveStreamByUser(user.address);
      if (activeStream) {
        console.log(`Restoring streamer session for user ${user.address}`);
        await client.join(`stream:${activeStream.id}`);
      }

      // Restore viewer sessions
      const activeViewStreams = await this.livestreamService.getStreamsByViewer(user.address);
      for (const stream of activeViewStreams) {
        console.log(`Restoring viewer session for user ${user.address} in stream ${stream.id}`);
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
          console.log(`Cleaning up stale connection for user ${user.address}`);
          await this.handleFinalDisconnect(socket, user);
        }
      }
    } catch (error) {
      console.error('Error in cleanupStaleConnections:', error);
    }
  }

  private async handleFinalDisconnect(client: Socket, user: any) {
    try {
      // Check if user was streaming
      const activeStream = await this.livestreamService.getActiveStreamByUser(user.address);
      if (activeStream) {
        console.log(
          `Streamer ${user.address} disconnected from stream ${activeStream.id}. Stream will be ended by Livepeer webhook if no reconnection occurs.`,
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
      console.error('Error in handleFinalDisconnect:', error);
    }
  }
}
