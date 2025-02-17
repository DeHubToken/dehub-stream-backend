// TODO: Make this work with mux
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
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

@WebSocketGateway({
  cors: {
    origin: '*',
    path: 'socket.io',
    // origin: process.env.FRONTEND_URL, // Update your .env FRONTEND_URL variable
  },
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private chatService: StreamChatService,
    @Inject(forwardRef(() => LivestreamService))
    private livestreamService: LivestreamService,
    private readonly hlsService: HlsService,
  ) {}

  private tempStorage: { [key: string]: fs.WriteStream } = {};

  afterInit(server: Server) {
    console.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);

    const user = client.handshake.auth?.user;
    if (user) {
      client.data.user = user;
      console.log(`User connected: ${user.username || user.address}`);

      // Restore user sessions: If the user was streaming or watching a stream, reattach them
      this.restoreUserSession(client, user);
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user;
    console.log(`Client disconnected: ${client.id} -- ${client.data?.user?.address}`);
    if (!user) {
      console.warn('Disconnected client had no associated user.');
      return;
    }

    // Handle streamer disconnect
    // const activeStream = await this.livestreamService.getActiveStreamByUser(user.address);
    // if (activeStream) {
    //   console.log(`User ${user.address} was livestreaming. Checking for reconnection...`);

    //   await this.handleEndStream(client, { streamId: activeStream.id });
    // }

    // Handle viewers leaving streams
    const activeViewStreams = await this.livestreamService.getStreamsByViewer(user.address);
    for (const stream of activeViewStreams) {
      await this.handleLeaveStream(client, { streamId: stream.id });
    }
  }

  // @UseGuards(WsAuthGuard)
  // @SubscribeMessage(LivestreamEvents.StreamData)
  // async handleStreamData(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() data: { streamId: string; chunk: ArrayBuffer },
  // ) {
  //   const { streamId, chunk } = data;
  //   const user = client.data.user;
  //   try {
  //     if (!chunk) {
  //       throw new Error('No chunk data provided.');
  //     }
  //     const stream = await this.livestreamService.getStream(streamId);
  //     if (!stream) {
  //       throw new Error('Stream not found.');
  //     }

  //     if (stream.status !== StreamStatus.LIVE && stream.status !== StreamStatus.ENDED) {
  //       throw new Error('Stream is not live.');
  //     }

  //     if (stream.address.toString() !== user.address) {
  //       throw new Error('You are not the owner of this stream.');
  //     }

  //     const buffer = Buffer.from(chunk);
  //     await this.hlsService.handleStreamChunk(streamId, buffer);
  //   } catch (error) {
  //     console.error('Stream processing error:', error);
  //     this.server.to(`stream:${streamId}`).emit(LivestreamEvents.StreamError, {
  //       message: 'Failed to process stream data',
  //       error: error.message,
  //     });
  //   }
  // }

  // @UseGuards(WsAuthGuard)
  // @SubscribeMessage(LivestreamEvents.StartStream)
  // async handleStartStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
  //   console.log('Starting stream with websocket');
  //   await client.join(`stream:${data.streamId}`);
  //   await this.livestreamService.startStream(client.data.user.address, { status: StreamStatus.LIVE }, data.streamId);
  //   // await this.hlsService.cleanupStream(data.streamId);
  //   // this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.StartStream, {
  //   //   streamId: data.streamId,
  //   // });
  // }

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
    await client.join(`stream:${data.streamId}`);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.JoinStream)
  async handleJoinStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    console.log(' Joining strean');
    const user = client.data.user;
    await client.join(`stream:${data.streamId}`);
    await this.livestreamService.addViewer(data.streamId, user.address);

    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.JoinStream, {
      viewerCount: await this.livestreamService.getViewerCount(data.streamId),
      user: { address: user.address, username: user.username || user.address },
    });

    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.ViewCountUpdate, {
      viewerCount: await this.livestreamService.getViewerCount(data.streamId),
    });
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(LivestreamEvents.LeaveStream)
  async handleLeaveStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    const user = client.data.user;
    await client.leave(`stream:${data.streamId}`);
    await this.livestreamService.removeViewer(data.streamId, user.address);

    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.LeaveStream, {
      viewerCount: await this.livestreamService.getViewerCount(data.streamId),
      user: { address: user.address, username: user.username || user.address },
    });

    // Emit viewer count update
    this.server.to(`stream:${data.streamId}`).emit(LivestreamEvents.ViewCountUpdate, {
      viewerCount: await this.livestreamService.getViewerCount(data.streamId),
    });
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
    const activeStream = await this.livestreamService.getActiveStreamByUser(user.address);
    if (activeStream) {
      console.log(`Restoring streamer session for user ${user.address}`);
      await client.join(`stream:${activeStream.id}`);
    }

    const activeViewStreams = await this.livestreamService.getStreamsByViewer(user.address);
    for (const stream of activeViewStreams) {
      console.log(`Restoring viewer session for user ${user.address} in stream ${stream.id}`);
      await this.handleJoinStream(client, { streamId: stream.id });
    }
  }

  private isUserStillConnected(address: string): boolean {
    return Array.from(this.server.sockets.sockets.values()).some(socket => socket.data?.user?.address === address);
  }

  private async convertToViewer(client: Socket, streamId: string) {
    // Placeholder function for later implementation
    console.log(`User ${client.data.user.address} converting to viewer after stream end.`);
  }
}
