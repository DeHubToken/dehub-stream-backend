import { Injectable } from '@nestjs/common';
import { Server, Namespace } from 'socket.io';
import { DMSocketService } from './dm.socket.service';
import { SocketEvent } from './types';
import { AccountModel } from 'models/Account';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitter, EventManager } from 'src/events/event-manager';
import { DmModel } from 'models/message/DM';
import { dmTips } from './pipline';
import Redis from 'ioredis';
import { config } from '../../config/index';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';

// interface Session {
//   username: string;
//   socketIds: string[]; // Store multiple socket IDs for each user
//   address: string;
//   _id: string;
// }

@Injectable()
@WebSocketGateway({
  namespace: '/dm',
  cors: { origin: '*' },
})
export class DMSocketController {
  @WebSocketServer()
  private server: Server;

  private dmNamespace: Namespace;
  private eventEmitter: EventEmitter2;
  private dmSocketService: any;
  private redisClient: Redis;

  constructor() {
    this.eventEmitter = EventManager.getInstance();
    this.redisClient = new Redis({ ...config.redis, db: 2 });
  }

  // Called after the gateway is initialized
  afterInit(server: Server) {
    // With namespace defined in the decorator, server is already namespaced
    this.dmNamespace = (server as unknown) as Namespace;
    this.dmSocketService = new DMSocketService(this.dmNamespace);
    this.listenEvents();
    this.bootstrap();
  }

  private bootstrap() {
    this.dmSocketService = new DMSocketService(this.dmNamespace);

    // Namespace for personal DMs
    this.dmNamespace.on(SocketEvent.connection, async socket => {
      const userAddress = socket.handshake.query.address as string;
      console.log('SocketEvent.connection userAddress', userAddress);

      // Fix incorrect precedence and handle falsy/undefined
      if (userAddress === undefined || !userAddress) {
        console.log('need to reconnect...');
        socket.emit(SocketEvent.reConnect, { msg: 'connecting....' });
        return;
      }
      await this.sessionSet(socket, userAddress);
      console.log(`Client connected to /dm: ${socket.id}`);
      // Handle socket events
      socket.on(SocketEvent.ping, data => {
        socket.emit(SocketEvent.pong, { msg: 'hi welcome' });
      });

      socket.on(
        SocketEvent.createAndStart,
        async (data: any) => await this.dmSocketService.createAndStart(await this.withSession(socket, data)),
      );

      socket.on(
        SocketEvent.sendMessage,
        async data =>
          await this.dmSocketService.sendMessage(await this.withRestrictedZone(await this.withSession(socket, data))),
      );
      socket.on(
        SocketEvent.deleteMessage,
        async data =>
          await this.dmSocketService.deleteMessage(await this.withRestrictedZone(await this.withSession(socket, data))),
      );
      socket.on(
        SocketEvent.ReValidateMessage,
        async data =>
          await this.dmSocketService.reValidateMessage(
            await this.withRestrictedZone(await this.withSession(socket, data)),
          ),
      );
      socket.on(SocketEvent.disconnect, async () => {
        console.log(`Client disconnected from /dm: ${socket.id}`);
        await this.unset(socket, userAddress);
      });
    });
  }

  // Save session data for the user
  async sessionSet(socket: any, userAddress: string) {
    const user: any = await AccountModel.findOne(
      { address: userAddress?.toLowerCase() },
      { username: 1, _id: 1, address: 1 },
    ).lean();

    if (!user) return;

    const redisKey = `user:${userAddress?.toLowerCase()}`;
    const session = JSON.parse(await this.redisClient.get(redisKey)) || {
      username: user.username,
      address: user.address,
      _id: user._id,
      socketIds: [],
    };

    // Add the new socket ID
    session.socketIds.push(socket.id);

    // Save updated session in Redis
    await this.redisClient.set(redisKey, JSON.stringify(session));
  }

  // Remove the socketId for the user when they disconnect
  async unset(socket: any, userAddress: string) {
    const redisKey = `user:${userAddress?.toLowerCase()}`;
    const session = JSON.parse(await this.redisClient.get(redisKey));

    if (session) {
      // Remove the socket ID from the session
      session.socketIds = session.socketIds.filter(id => id !== socket.id);

      if (session.socketIds.length > 0) {
        // Update the session in Redis
        await this.redisClient.set(redisKey, JSON.stringify(session));
      } else {
        // Delete the session from Redis if no socket IDs remain
        await this.redisClient.del(redisKey);
      }
    }
  }

  async withSession(socket, req) {
    const userAddress = socket.handshake.query.address as string;
    const redisKey = `user:${userAddress?.toLowerCase()}`;
    const raw = await this.redisClient.get(redisKey);
    const session = raw ? JSON.parse(raw) : null;
    return { req, socket, session: { user: session, redisClient: this.redisClient } };
  }

  async withRestrictedZone({ req, socket, session }) {
    const blockList = await this.dmSocketService.getBlockedUsersForConversation(req.dmId);
    const dm: any = await DmModel.findById(req.dmId, { _id: 1, conversationType: 1 });
    const userId = session.user._id;
  let next = true;
    if (blockList.length > 0 && dm.conversationType == 'dm') {
      socket.emit(SocketEvent.error, { msg: 'this chat was blocked' });
      next = false;
    }

    if (dm.conversationType == 'group') {
      blockList.find(list => {
        console.log(list.reportedBy, list.reportedUser, userId.toString());
        if (list.reportedBy == userId.toString() || list.reportedUser == userId.toString()) {
          socket.emit(SocketEvent.error, { msg: 'this chat was blocked' });
          next = false;
        }
      });
    }
    if (!next) {
      return { req: null, socket: null, session: null, blockList: null, dm: null };
    }

    return { req, socket, session, blockList, dm };
  }

  async listenEvents() {
    this.eventEmitter.on(EventEmitter.tipSend, async payload => {
  const { senderAddress, receiverAddress, dmId } = payload;

  const senderSessionRaw = await this.redisClient.get(`user:${senderAddress?.toLowerCase()}`);
  const receiverSessionRaw = await this.redisClient.get(`user:${receiverAddress?.toLowerCase()}`);
  const senderSession = senderSessionRaw ? JSON.parse(senderSessionRaw) : null;
  const receiverSession = receiverSessionRaw ? JSON.parse(receiverSessionRaw) : null;

      const updatedDM = await DmModel.aggregate([
        {
          $match: {
            _id: dmId,
          },
        },
        ...dmTips,
        {
          $project: {
            dmId: '$_id',
            tips: 1,
            _id: 0,
          },
        },
      ]);

      if (senderSession?.socketIds?.length) {
        this.dmNamespace.to(senderSession.socketIds).emit(SocketEvent.tipUpdate, updatedDM[0]);
      }
      if (receiverSession?.socketIds?.length) {
        this.dmNamespace.to(receiverSession.socketIds).emit(SocketEvent.tipUpdate, updatedDM[0]);
      }

      console.log('tip-updates-sent');
    });
  }
}
