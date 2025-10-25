import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { DMSocketController } from 'src/dm/dm.socket.controller'; 
export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      ...options,
    });

    server.on('connection', (socket) => {
      // console.log(`Client connected: ${socket.id}`);
    });
    // new DMSocketController(server); 
    return server;
  }
}
