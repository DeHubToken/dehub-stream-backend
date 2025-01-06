import { Injectable } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { MessageModel } from 'models/message/dm-messages';
import { SocketEvent } from './types';
import { DmModel } from 'models/message/DM';
import { AccountModel } from 'models/Account';
import { Types } from 'mongoose';
import { ACTION_TYPE, UserReportModel } from 'models/user-report';

@Injectable()
export class DMSocketService {
  private dmNamespace: Namespace;
  constructor(dmNamespace) {
    this.dmNamespace = dmNamespace;
  }
  async createAndStart({ socket, req, session }: { socket: any; req: any; session: any }) {
    // Extract the second user's ID from the request
    const { _id: userId2 } = req;

    if (!userId2) {
      socket.emit(SocketEvent.error, { msg: 'Invalid user.' });
      return;
    }

    // Check if a DM session already exists between the two users
    const existingDm = await DmModel.findOne({
      participants: {
        $all: [{ $elemMatch: { participant: session.user._id } }, { $elemMatch: { participant: userId2 } }],
      },
      conversationType: 'dm',
    }).lean();

    // Retrieve the second user's information
    const user2 = await AccountModel.findById(userId2, {
      _id: 1,
      username: 1,
      avatarImageUrl: 1,
      displayName: 1,
      address: 1,
    }).lean();

    if (existingDm) {
      // If a DM session exists, send it back to the client
      socket.emit(SocketEvent.createAndStart, {
        msg: 'DM session exists',
        data: { ...existingDm, participants: [{ participant: user2, role: 'member' }] },
      });
    } else {
      // Prepare participants array
      const participants = [
        { participant: session.user._id, role: 'member' }, // Assign 'member' role to the initiator
        { participant: userId2, role: 'member' }, // Assign 'member' role to the other user
      ];

      // If no DM session exists, create a new one
      const newDm: any = new DmModel({
        participants,
        createdBy: session.user._id,
        conversationType: 'dm',
        lastMessageAt: new Date(),
      });

      // Save the new DM session to the database
      await newDm.save();

      // Emit the event to notify the client
      socket.emit(SocketEvent.createAndStart, {
        msg: 'Created new DM',
        data: { ...newDm._doc, participants: [{ participant: user2, role: 'member' }] },
      });
    }
  }

  async sendMessage({ socket, req, session, blockList }: { socket: any; req: any; session: any; blockList: any }) {
    if (!socket || !req || !session) {
      return;
    }

    const userId = session.user._id;
    const state: any = {
      conversation: req.dmId,
      sender: userId,
      isRead: false,
      content: req.content,
      msgType: req.type,
    };
    if (state.msgType == 'gif') {
      state.mediaUrls = [
        {
          url: req.gif, // Assuming req.gif contains the URL of the uploaded GIF
          type: 'gif',
          mimeType: 'image/gif', // MIME type for GIF
        },
      ];
    }
    const newMsg: any = await MessageModel.create(state);
    socket.emit(SocketEvent.sendMessage, { ...newMsg?._doc, author: 'me' });
    const dm = await DmModel.findById(req.dmId);
    let ids = dm.participants.reduce((acc, current) => {
      const { participant } = current;
      if (participant && participant.toString() !== userId.toString()) {
        return [...acc, participant];
      }
      return acc;
    }, []);

    let socketsUsers = await this.getOnlineSocketsUsers(session, ids);
    socketsUsers = socketsUsers.filter(user => {
      return !blockList.some(blocked => {
        if (blocked.reportedBy) {
          return blocked.reportedBy.toString() === user._id.toString();
        }

        if (blocked.reportedUser) {
          return blocked.reportedUser.toString() === user._id.toString();
        }
      });
    });
    socketsUsers.forEach(su => {
      if (su.socketIds && su.socketIds.length > 0) {
        socket.in(su.socketIds).emit(SocketEvent.sendMessage, { ...newMsg?._doc, author: 'other' });
      }
    });
  }
  async reValidateMessage({
    socket,
    req,
    session,
    blockList,
  }: {
    socket: any;
    req: any;
    session: any;
    blockList: any;
  }) {
    const userId = session.user._id;
    console.log('userId', userId);
    const messageId = req.messageId;
    const singleMessagePipeline = [
      // Match the specific message by _id
      {
        $match: {
          _id: new Types.ObjectId(messageId),
        },
      },

      // Lookup sender details
      {
        $lookup: {
          from: 'accounts',
          localField: 'sender',
          foreignField: '_id',
          as: 'senderDetails',
          pipeline: [
            {
              $project: {
                _id: 1,
                username: 1,
                address: 1,
                displayName: 1,
              },
            },
          ],
        },
      },
      // Lookup purchase options details
      {
        $unwind: {
          path: '$purchaseOptions',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'purchaseoptions',
          localField: 'purchaseOptions._id',
          foreignField: '_id',
          as: 'purchaseOptionDetails',
        },
      },
      {
        $addFields: {
          purchaseOptions: {
            $mergeObjects: ['$purchaseOptions', { details: { $arrayElemAt: ['$purchaseOptionDetails', 0] } }],
          },
        },
      },
      // Re-group purchase options
      {
        $group: {
          _id: '$_id',
          sender: { $first: '$sender' },
          author: { $first: '$author' },
          conversation: { $first: '$conversation' },
          uploadStatus: { $first: '$uploadStatus' },
          msgType: { $first: '$msgType' },
          isRead: { $first: '$isRead' },
          isPaid: { $first: '$isPaid' },
          failureReason: { $first: '$failureReason' },
          mediaUrls: { $first: '$mediaUrls' },
          isUnlocked: { $first: '$isUnlocked' },
          purchaseOptions: { $push: '$purchaseOptions' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
        },
      },
    ];

    const validatedMessages = await MessageModel.aggregate(singleMessagePipeline); 
    const message = validatedMessages[0];
    if (message.sender.toString() == userId.toString()) {
      message.author = 'me';
    }
    socket.emit(SocketEvent.ReValidateMessage, {
      dmId: req.dmId,
      message: message,
    });
    const dm = await DmModel.findById(req.dmId);
    let ids = dm.participants.reduce((acc, current) => {
      const { participant } = current;
      if (participant && participant.toString() !== userId.toString()) {
        return [...acc, participant];
      }
      return acc;
    }, []);
    let socketsUsers = await this.getOnlineSocketsUsers(session, ids);
    message.author = 'other';
    socketsUsers = socketsUsers.filter(user => {
      return !blockList.some(blocked => {
        if (blocked.reportedBy) {
          return blocked.reportedBy.toString() === user._id.toString();
        }

        if (blocked.reportedUser) {
          return blocked.reportedUser.toString() === user._id.toString();
        }
      });
    });
    socketsUsers.forEach(su => {
      if (su.socketIds && su.socketIds.length > 0) {
        socket.in(su.socketIds).emit(SocketEvent.ReValidateMessage, {
          dmId: req.dmId,
          message: message,
        });
      }
    });
  }
  async getOnlineSocketsUsers(session, ids) {
    const users = await AccountModel.find({ $or: [{ _id: { $in: ids } }] }, { address: 1 }).lean();
    return users.map(user => {
      const sessionUser = session.users.get(user.address.toLowerCase());
      if (sessionUser) {
        return sessionUser;
      }
      return user;
    });
  }
  // Helper method to check for blocked users in a specific conversation (DM or group)
  async getBlockedUsersForConversation(conversationId: string): Promise<any[]> {
    // Explicit return type of UserReport[]
    const blocked = await UserReportModel.find({
      conversation: conversationId,
      resolved: false, // Ensure the block is unresolved
    }).lean();

    return blocked;
  }
}
