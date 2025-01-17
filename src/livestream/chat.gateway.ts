import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
// import { ChatService } from './chat.service';
import { BadRequestException, UseGuards } from '@nestjs/common';
import { WsAuthGuard } from 'common/guards/ws.guard';
import { StreamChatService } from './chat.service';
import { LivestreamService } from './livestream.service';
import * as fs from 'fs';
import * as path from 'path';
import { HlsService } from './hls.service';

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
    private livestreamService: LivestreamService,
    private readonly hlsService: HlsService,
  ) {}

  private tempStorage: { [key: string]: fs.WriteStream } = {};

  afterInit(server: Server) {
    console.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    // Optional: Store client information
    // Optional: Send initial data
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // Clean up resources
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('streamData')
  async handleStreamData(@MessageBody() data: { streamId: string; chunk: ArrayBuffer }) {
    const { streamId, chunk } = data;
    try {
      if(!chunk) return
        const buffer = Buffer.from(chunk);
        await this.hlsService.handleStreamChunk(streamId, buffer);
    } catch (error) {
      console.error('Stream processing error:', error);
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('endStream')
  async handleEndStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    console.log("Ending stream")
    return this.hlsService.cleanupStream(data.streamId)
  }

  // @UseGuards(WsAuthGuard)
  // @SubscribeMessage('streamEnd')
  // async handleStreamEnd(@MessageBody() data: { streamId: string }) {
  //   const { streamId } = data;
  //   const slug = `live_${streamId}`;

  //   try {
  //     const hlsUrl = await this.hlsService.uploadHlsToCdn(path.resolve('streams', slug), slug);
  //     console.log(`Stream finalized. HLS URL: ${hlsUrl}`);
  //   } catch (error) {
  //     console.error('Error finalizing stream:', error);
  //   }
  // }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('joinStream')
  async handleJoinStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    const user = client.data.user;
    await client.join(`stream:${data.streamId}`);
    await this.livestreamService.addViewer(data.streamId, user.id);

    this.server.to(`stream:${data.streamId}`).emit('viewerJoined', {
      viewerCount: await this.livestreamService.getViewerCount(data.streamId),
      user: { id: user.id, username: user.username || user.address || user.address },
    });
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('leaveStream')
  async handleLeaveStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
    const user = client.data.user;
    await client.leave(`stream:${data.streamId}`);
    await this.livestreamService.removeViewer(data.streamId, user.id);

    this.server.to(`stream:${data.streamId}`).emit('viewerLeft', {
      viewerCount: await this.livestreamService.getViewerCount(data.streamId),
      userId: user.id,
    });
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('chatMessage')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; content: string },
  ) {
    console.log('Mateeeee');
    const user = client.data.user;

    const message = await this.chatService.addChatMessage(data.streamId, user.address, data.content, {});

    this.server.to(`stream:${data.streamId}`).emit('newMessage', {
      ...message,
      user: { id: user.id, username: user.username || user.address },
    });
  }

//   @SubscribeMessage('endStream')
//   async handleEndStream(@ConnectedSocket() client: Socket, @MessageBody() data: { streamId: string }) {
//     const filePath = path.join('uploads', `${data.streamId}.webm`);
//     const writeStream = this.tempStorage[data.streamId];

//     if (writeStream) {
//       writeStream.end();
//       delete this.tempStorage[data.streamId];
//     }

//     // Process HLS and return playback URL
//     const slug = `hls/${data.streamId}`;
//     const playbackUrl = 'await this.hlsService.processStream(filePath, slug)';
//     // const playbackUrl = await this.hlsService.processStream(filePath, slug);
//     fs.unlinkSync(filePath);

//     this.server.to(`stream:${data.streamId}`).emit('streamEnded', { playbackUrl });
//   }
// }

// @SubscribeMessage('streamEnd')
// handleStreamEnd(@MessageBody() data: { streamId: string }) {
//   if (this.tempStorage[data.streamId]) {
//     this.tempStorage[data.streamId].end(); // Close the stream
//     delete this.tempStorage[data.streamId]; // Remove reference
//   }
// }
//   @UseGuards(WsAuthGuard)

//   @SubscribeMessage('react')
//   async handleReaction(
//     @ConnectedSocket() client: Socket,
//     @MessageBody() data: { streamId: string; reactionType: string },
//   ) {
//     const user = client.data.user;
//     await this.chatService.addReaction(data.streamId, user.id, data.reactionType);

//     this.server.to(`stream:${data.streamId}`).emit('newActivity', {
//       type: 'REACTION',
//       userId: user.id,
//       reactionType: data.reactionType,
//     });
//   }
}