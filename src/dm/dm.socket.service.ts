import { Injectable } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { DmMessageModel } from 'models/message/dm-messages';
import { SocketEvent } from './types';
import { DmModel } from 'models/message/DM';
import { AccountModel } from 'models/Account';
import { Types } from 'mongoose';

@Injectable()
export class DMSocketService {
  private dmNamespace: Namespace;

  constructor(dmNamespace) {
    this.dmNamespace = dmNamespace;
  }

  async createAndStart({ socket, req, session }: { socket: any; req: any; session: any }) {
    // Extract the two users' IDs from the data (assuming data contains the users' _id)

    const { _id: userId2 } = req;
    if (!req._id) {
      socket.emit(SocketEvent.error, { msg: 'Invalid user.' });
    }
    const existingDm = await DmModel.findOne({
      participants: { $all: [session.user._id, userId2] },
    });

    if (existingDm) {
      // If a DM session exists, send it back to the client
      socket.emit(SocketEvent.createAndStart, { msg: 'DM session exists', data: existingDm });
    } else {
      // If no DM session exists, create a new one
      const newDm = new DmModel({
        participants: [session.user._id, userId2],
        createdBy: session.user._id,
        conversationType: 'dm',
        lastMessageAt: new Date(),
      });

      // Save the new DM session to the database
      await newDm.save();

      // Emit the event to notify the client
      socket.emit(SocketEvent.createAndStart, { msg: 'Created new DM', data: newDm });
    }
  }

  async sendMessage({ socket, req, session }: { socket: any; req: any; session: any }) {
    console.log(session);
    const userId = session.user._id;
    const newMsg: any = await DmMessageModel.create({
      conversation: req.dmId,
      sender: userId,
      isRead: false,
      content: req.msg,
    });
    console.log(newMsg);
    socket.emit(SocketEvent.sendMessage, { ...newMsg?._doc, author: 'me' });
    const dm = await DmModel.findById(req.dmId);

    let ids = dm.participants.filter(d => d.toString() != userId.toString());

    const socketsUsers = await this.getOnlineSocketsUsers(session, ids);
    socketsUsers.forEach(su => {
      // su.socketIds is assumed to be an array of socket IDs for this user
      if (su.socketIds && su.socketIds.length > 0) {
        // Emitting the message to all socket IDs for this user
        socket.in(su.socketIds).emit(SocketEvent.sendMessage, { ...newMsg?._doc, author: 'other' });
      }
    });
  }

  async getOnlineSocketsUsers(session, ids) {
    const users = await AccountModel.find({ $or: [{ _id: { $in: ids } }] }, { address: 1 }).lean();
    console.log('session.users', session.users);
    return users.map(user => {
      const sessionUser = session.users.get(user.address.toLowerCase());
      if (sessionUser) {
        return sessionUser;
      }
      return user;
    });
  }
}
