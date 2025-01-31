// video.gateway.ts
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // Adjust as needed
  },
})
export class JobGateway {
  @WebSocketServer()
  server: Server;

  // Emit progress
  emitProgress(props: { progress: number; stage: string }, tokenId: string) {
    this.server.emit(tokenId, props);
  }
  emitDmUploadProgress(data) { 
    this.server.of('/dm').emit('jobMessageId',data)
  }
}
