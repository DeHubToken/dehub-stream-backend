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
interface Session {
  username: string;
  socketIds: string[]; // Store multiple socket IDs for each user
  address: string;
  _id: string;
}

@Injectable()
export class DMSocketController {
  private dmNamespace: Namespace;
  private users: Map<string, Session> = new Map(); // Map of user _id to Session object
  private eventEmitter: EventEmitter2;
  private dmSocketService: any;

  constructor(private readonly io: Server) {
    this.dmNamespace = this.io.of('/dm');
    this.eventEmitter = EventManager.getInstance();
    this.bootstrap();
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
    // If user already exists in the users map, update their socketIds
    let session = this.users.get(userAddress?.toLowerCase());

    if (session) {
      // Add the new socketId to the existing user's socketIds array
      session.socketIds.push(socket.id);
    } else {
      // If the user is not in the map, create a new session for them
      session = { ...user, socketIds: [socket.id] };
    }
    // Update the users map with the new session
    this.users.set(userAddress?.toLowerCase(), session);
  }

  // Remove the socketId for the user when they disconnect
  async unset(socket: any, userAddress: string) {
    const session = this.users.get(userAddress?.toLowerCase());
    if (session) {
      // Remove the socketId from the session
      session.socketIds = session.socketIds.filter(id => id !== socket.id);
      // If there are no more socketIds for this user, remove the user from the map
      if (session.socketIds.length === 0) {
        this.users.delete(userAddress?.toLowerCase());
      }
    }
  }

  async withSession(socket, req) {
    // Find the user in the map
    const userAddress = socket.handshake.query.address;
    const session = await this.users.get(userAddress?.toLowerCase());
    return { req, socket, session: { user: session, users: this.users } };
  }

  async withRestrictedZone({ req, socket, session }) {
    const blockList = await this.dmSocketService.getBlockedUsersForConversation(req.dmId);
    const userId = session.user._id;
    let next = true;
    blockList.find(list => {
      if (list.reportedBy == userId.toString() || list.reportedUser == userId.toString()) {
        socket.emit(SocketEvent.error, { msg: 'this chat was blocked' });
        next = false;
      }
    });
    if (!next) {
      return { req: null, socket: null, session: null, blockList: null };
    }
    return { req, socket, session, blockList };
  }

  async listenEvents() {
    // Add an event listener
    this.eventEmitter.on(EventEmitter.tipSend, async payload => {
      const { senderAddress, receiverAddress, dmId } = payload;
      const senderSession = await this.users.get(senderAddress?.toLowerCase());
      const receiveSession = await this.users.get(receiverAddress?.toLowerCase());
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
      if (receiveSession?.socketIds) {
        this.dmNamespace.to(senderSession?.socketIds).emit(SocketEvent.tipUpdate, updatedDM[0]);
      } 
      console.log("tip-updates-sent")

    });
  }
}
