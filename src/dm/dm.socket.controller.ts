import { Injectable } from '@nestjs/common';
import { Server, Namespace } from 'socket.io';
import { DMSocketService } from './dm.socket.service';
import { SocketEvent } from './types';
import { AccountModel } from 'models/Account';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EventEmitter, EventManager } from 'src/events/event-manager';
import { Types } from 'mongoose';
import { DmModel } from 'models/message/DM';
import { dmTips } from './pipline';
import Redis from 'ioredis';
// interface Session {
//   username: string;
//   socketIds: string[]; // Store multiple socket IDs for each user
//   address: string;
//   _id: string;
// }

@Injectable()
export class DMSocketController {
  private dmNamespace: Namespace;
  // private users: Map<string, Session> = new Map(); // Map of user _id to Session object
  private eventEmitter: EventEmitter2;
  private dmSocketService: any;
  private redisClient: Redis;

  constructor(private readonly io: Server) {
    this.dmNamespace = this.io.of('/dm');
    this.eventEmitter = EventManager.getInstance();
    this.bootstrap();
    this.redisClient = new Redis();
    this.listenEvents();
  }

  private bootstrap() {
    this.dmSocketService = new DMSocketService(this.dmNamespace);

    // Namespace for personal DMs
    this.dmNamespace.on(SocketEvent.connection, async socket => {
      const userAddress = socket.handshake.query.address;
      console.log('SocketEvent.connection userAddress', userAddress, socket.handshake);

      if (!userAddress == undefined || !userAddress) {
        console.log('need to reconnect...');
        socket.emit(SocketEvent.reConnect, { msg: 'connecting....' });
      }
      if (!userAddress) {
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
    const userAddress = socket.handshake.query.address;
    const redisKey = `user:${userAddress?.toLowerCase()}`;
    const session = JSON.parse(await this.redisClient.get(redisKey));
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
      return { req: null, socket: null, session: null, blockList: null };
    }
 
    return { req, socket, session, blockList };
  }

  async listenEvents() {
    this.eventEmitter.on(EventEmitter.tipSend, async payload => {
      const { senderAddress, receiverAddress, dmId } = payload;

      const senderSession = JSON.parse(
        await this.redisClient.get(`user:${senderAddress?.toLowerCase()}`)
      );
      const receiverSession = JSON.parse(
        await this.redisClient.get(`user:${receiverAddress?.toLowerCase()}`)
      );

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

      if (senderSession?.socketIds) {
        this.dmNamespace.to(senderSession?.socketIds).emit(SocketEvent.tipUpdate, updatedDM[0]);
      }
      if (receiverSession?.socketIds) {
        this.dmNamespace.to(receiverSession?.socketIds).emit(SocketEvent.tipUpdate, updatedDM[0]);
      }

      console.log('tip-updates-sent');
    });
  }

}
