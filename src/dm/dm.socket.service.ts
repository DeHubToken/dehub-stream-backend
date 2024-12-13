import { Injectable } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { DmMessageModel } from 'models/message/dm-messages';
import { SocketEvent } from './types';
import { DmModel } from 'models/message/DM';
import { AccountModel } from 'models/Account';

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
        lastMessageAt: new Date(),
      });

      // Save the new DM session to the database
      await newDm.save();

      // Emit the event to notify the client
      socket.emit(SocketEvent.createAndStart, { msg: 'Created new DM', data: newDm });
    }
  }
  async fetchDMessages({ socket, req, session }: { socket: any; req: any; session: any }) {
    // Define your aggregation pipeline
    const pipeline: any = [
      // Match messages where the session user is part of the conversation
      { $match: { participants: { $in: [session.user._id] } } }, // Match documents based on session user
      { $sort: { createdAt: -1 } }, // Sort messages by creation time in descending order

      // Lookup messages based on the conversation
      {
        $lookup: {
          from: 'messages', // Collection name for messages
          localField: '_id', // Field in DM model
          foreignField: 'conversation', // Field in Message model
          as: 'messages', // Alias for the result of the lookup
        },
      },

      // Unwind the participants array to join details for each participant
      {
        $unwind: {
          path: '$participants',
          preserveNullAndEmptyArrays: true, // Keep DM documents with no participants
        },
      },

      // Lookup participants' details from the Account collection
      {
        $lookup: {
          from: 'accounts', // Collection name for participants (Account model)
          localField: 'participants', // Field in DM model (participant ObjectId)
          foreignField: '_id', // Field in Account model (_id is the reference for participant)
          as: 'participantDetails', // Alias for the participants' details
        },
      },

      // Unwind participantDetails to access details as an object
      {
        $unwind: {
          path: '$participantDetails',
          preserveNullAndEmptyArrays: true,
        },
      },

      // Filter out the session user from participantDetails
      {
        $match: {
          'participantDetails._id': { $ne: session.user._id },
        },
      },

      // Regroup the data to include only the relevant fields
      {
        $group: {
          _id: '$_id',
          participant: { $first: '$participantDetails' }, // Only the other participant
          lastMessageAt: { $first: '$lastMessageAt' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
          address: { $first: '$address' },
          messages: { $first: '$messages' },
        },
      },

      // Map messages to include an "author" field
      {
        $addFields: {
          messages: {
            $map: {
              input: '$messages',
              as: 'message',
              in: {
                $mergeObjects: [
                  '$$message',
                  {
                    author: {
                      $cond: {
                        if: { $eq: ['$$message.sender', session.user._id] },
                        then: 'me',
                        else: 'other',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },

      // Optionally, project only the required fields
      {
        $project: {
          _id: 1,
          participant: {
            _id: 1,
            displayName: 1,
            username: 1,
            avatarImageUrl: 1,
            online: 1,
            updatedAt: 1,
            address: 1,
          },
          lastMessageAt: 1,
          createdAt: 1,
          updatedAt: 1,
          messages: { $slice: ['$messages', 1] }, // Include only the last message if needed
        },
      },
    ];

    // Execute aggregation using DmModel
    const dms = await DmModel.aggregate(pipeline);
    socket.emit(SocketEvent.fetchDMessages, dms);
  }

  async sendMessage({ socket, req, session }: { socket: any; req: any; session: any }) {
    const userId = session.user._id;
    const newMsg = await DmMessageModel.create({
      conversation: req.dmId,
      sender: userId,
      isRead: false,
      content: req.msg,
    });
    console.log(newMsg);
    socket.emit(SocketEvent.sendMessage, { ...newMsg, author: 'me' });
    const dm = await DmModel.findById(req.dmId);
    let participants = dm.participants;
    participants.filter(d => d != userId);

    console.log(session.users);
    // const sockets = this.getOnlineSocketsIds(session, participants);
    // participants.forEach(p => {
    //   if (p != userId) {

    //   }
    // });
  }

  async getOnlineSocketsIds(session, ids) {
    const soc = [];
    const users = await AccountModel.find({ $or: [{ _id: { $in: ids } }] }, { address: 1 });

    console.log('getOnlineSocketsIds', users);
    session.users.users //it an Map()
      .forEach(user => {
        const sessionUser = session.users.get(user?.address?.toLowerCase());
        const { socketIds } = sessionUser;
        soc.concat(socketIds);
      });
  }
}
