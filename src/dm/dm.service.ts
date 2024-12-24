import { Injectable, UploadedFile } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { AccountModel } from 'models/Account';
import { Request, Response } from 'express';
import { MessageModel } from 'models/message/dm-messages';
import mongoose from 'mongoose';
import { DmModel } from 'models/message/DM';
import { PlansModel } from 'models/Plans';
import { CdnService } from 'src/cdn/cdn.service';
import { JobService } from 'src/job/job.service';
import { UserReportModel } from 'models/user-report';
@Injectable()
export class DMService {
  constructor(
    private readonly cdnService: CdnService,
    private readonly jobService: JobService,
  ) {}

  async searchUserOrGroup(req: Request, res: Response) {
    try {
      const query: string = reqParam(req, 'q');

      console.log(query);

      const users = await AccountModel.find(
        {
          $or: [
            { username: { $regex: query, $options: 'i' } }, // Case-insensitive regex match
            { address: { $regex: query?.toLowerCase() || '' } }, // Partial match for address
          ],
        },
        {
          username: 1,
          _id: 1,
          address: 1,
          avatarImageUrl: 1,
        },
      ).exec(); // Execute the query

      return res.status(200).json({ users });
    } catch (error) {
      console.error('Error searching users or groups:', error);
      return res.status(500).json({
        message: 'Failed to fetch users or groups',
        error: error.message,
      });
    }
  }

  async getMessagesDm(req: Request, res: Response) {
    try {
      // Retrieve and validate parameters
      const id = reqParam(req, 'id');
      const q = reqParam(req, 'q'); // for searching messages using regex
      const skip = parseInt(reqParam(req, 'skip'), 10) || 0;
      const limit = parseInt(reqParam(req, 'limit'), 10) || 10;
      const address = reqParam(req, 'address')?.toLowerCase();

      // Validate ID
      if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid or missing ID format' });
      }

      // Retrieve the user by address
      const user = await AccountModel.findOne({ address });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userId = user._id; // Add 'author: "me"' if the sender address matches

      const dm = await DmModel.find({
        _id: new mongoose.Types.ObjectId(id),
        participants: { $in: [userId] },
      });
      if (!dm) {
        return res.status(404).json({ error: 'No chat between us' });
      }
      // Construct the aggregation pipeline
      const pipeline: mongoose.PipelineStage[] = [
        {
          $match: {
            conversation: new mongoose.Types.ObjectId(id), // Match the conversation ID
            ...(q && { content: { $regex: q, $options: 'i' } }), // Add regex search if 'q' is provided
          },
        },
        {
          $addFields: {
            author: {
              $cond: [{ $eq: ['$sender', userId] }, 'me', '$sender'], // Add 'me' for the user's messages
            },
          },
        },
        {
          $sort: {
            createdAt: -1, // Sort by `createdAt` field in descending order (latest first)
          },
        },

        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ];

      // Execute the aggregation
      const messages = await MessageModel.aggregate(pipeline);

      // Send response
      return res.status(200).json({ messages: messages.reverse() });
    } catch (error) {
      console.error('Error fetching messages:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getContacts(req: Request, res: Response) {
    const address = reqParam(req, 'address').toLowerCase();
    const user = await AccountModel.findOne({ address: address }, { _id: 1 });
    // Define your aggregation pipeline
    const pipeline: any = [
      // Match messages where the session user is part of the conversation
      { $match: { participants: { $in: [user._id] } } }, // Match documents based on session user
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
          'participantDetails._id': { $ne: user._id },
        },
      },

      // Regroup the data to include only the relevant fields
      {
        $group: {
          _id: '$_id',
          conversationType: { $first: '$conversationType' },
          groupName: { $first: '$groupName' },
          participants: { $addToSet: '$participantDetails' },
          lastMessageAt: { $first: '$lastMessageAt' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
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
                        if: { $eq: ['$$message.sender', user._id] },
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

      // Project relevant fields
      {
        $project: {
          _id: 1,
          conversationType: 1,
          groupName: 1,
          participants: {
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
          messages: { $slice: ['$messages', 20] }, // Last 20 messages
        },
      },
    ];

    // Execute aggregation using DmModel
    const dms = await DmModel.aggregate(pipeline);
    res.status(200).json(dms);
  }

  async createGroupChat(req: Request, res: Response) {
    try {
      // Parse input data
      const groupName = reqParam(req, 'groupName');
      const plans = reqParam(req, 'plans');
      const users = reqParam(req, 'users');
      const createdBy = reqParam(req, 'address');

      // Basic validation
      if (!groupName || !users || users.length < 2) {
        return res.status(400).json({ success: false, message: 'Group name and at least 2 members are required.' });
      }

      // Optional: Validate the `createdBy` user
      const creatorExists = await AccountModel.findOne({ address: createdBy }, { _id: 1 });
      if (!creatorExists) {
        return res.status(400).json({ success: false, message: 'Creator does not exist.' });
      }

      // Optional: Validate `plans` (if you want to ensure they are valid plan IDs)
      const validPlans = await PlansModel.find({ id: { $in: plans } }, { _id: 1 });
      if (validPlans.length !== plans.length) {
        return res.status(400).json({ success: false, message: 'One or more plans are invalid.' });
      }
      // Create the group chat in the database
      const newGroupChat = await DmModel.create({
        groupName,
        description: reqParam(req, 'description') || '', // Optional description
        participants: [...users, creatorExists._id],
        conversationType: 'group',
        plans: [...validPlans], // Assuming only one plan can be associated with a group
        createdBy: creatorExists._id,
      });

      return res.status(201).json({
        success: true,
        message: 'Group chat created successfully!',
        data: newGroupChat,
      });
    } catch (error) {
      console.error('Error creating group chat:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while creating the group chat.',
      });
    }
  }

  async uploadDm(req: Request, res: Response, files: { files: Express.Multer.File[] }) {
    const conversationId = reqParam(req, 'conversationId');
    const senderId = reqParam(req, 'senderId');
    const amount = reqParam(req, 'amount');
    const token = reqParam(req, 'token');
    const isPaid = reqParam(req, 'isPaid');
    const user = await AccountModel.findOne({ address: senderId.toLowerCase() }, { _id: 1 });
    const msg = await MessageModel.create({
      sender: user._id,
      conversation: conversationId,
      msgType: 'media',
      uploadStatus: 'pending',
      isRead: false,
    });

    const { files: data } = files;
    // Map files to MediaJobPayload[]
    const payloads: {
      buffer: Buffer;
      slug: string;
      filename: string;
      mimeType: string;
      messageId?: string;
    }[] = data.map(file => ({
      buffer: file.buffer,
      slug: `${conversationId}-${file.originalname}`, // Generate a unique slug
      filename: file.originalname,
      mimeType: file.mimetype,
      messageId: msg._id.toString(), // Optional: Define if you have pre-generated IDs
    }));

    // Add jobs to the queue
    await this.jobService.bulkAddMediaUploadJob(payloads);

    return res.status(200).json(msg);
  }
  async blockDm(req: Request, res: Response) {
    try {
      const conversationId = reqParam(req, 'conversationId'); // Get conversation ID from request
      const reason = reqParam(req, 'reason'); // Get reason for blocking
      const address = reqParam(req, 'address'); // Get user's address from request

      const user = await AccountModel.findOne({ address: address.toLowerCase() });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const conversation = await DmModel.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Check if the block entry already exists
      const existingBlock = await UserReportModel.findOne({
        conversation: conversationId,
        reportedBy: user._id,
        action: 'block',
      });

      if (existingBlock) {
        return res.status(400).json({
          error: 'You have already blocked this conversation or user.',
        });
      }

      // If conversation type is group, block the group
      if (conversation.conversationType === 'group') {
        const updatedReport = await UserReportModel.findOneAndUpdate(
          {
            conversation: conversationId,
            reportedBy: user._id,
          },
          {
            $set: {
              action: 'block',
              reason: reason || 'No reason provided',
              resolved: false,
              isGlobal: false,
              reportedUser: null, // No specific user for group blocks
              conversation: conversationId,
            },
          },
          { new: true, upsert: true }, // Create a new document if one doesn't exist
        );

        return res.status(200).json({
          message: 'Group successfully blocked.',
          blocked: true,
          conversationId: conversationId,
          reportId: updatedReport._id,
        });
      }

      // For DM, find the other participant to block
      const reportedUserId = conversation.participants.find(
        participantId => participantId.toString() !== user._id.toString(),
      );

      if (!reportedUserId) {
        return res.status(404).json({ error: 'No other user found in this conversation.' });
      }

      // Update or create a block entry for the DM
      const updatedReport = await UserReportModel.findOneAndUpdate(
        {
          conversation: conversationId,
          reportedBy: user._id,
        },
        {
          $set: {
            action: 'block',
            reason: reason || 'No reason provided',
            resolved: false,
            isGlobal: false,
            reportedUser: reportedUserId, // Block the other participant in the DM
            conversation: conversationId,
          },
        },
        { new: true, upsert: true }, // Create a new document if one doesn't exist
      );

      return res.status(200).json({
        message: 'User successfully blocked in the DM.',
        blocked: true,
        conversationId: conversationId,
        reportId: updatedReport._id,
      });
    } catch (error) {
      console.error('Error in blockDm:', error);
      return res.status(500).json({
        error: 'An error occurred while processing your request.',
      });
    }
  }
  async getVideoStream(req: Request, res: Response) {
    res.status(400).json({ success: false, message: 'getVideoStream  not completed yat.' });
  }
}
