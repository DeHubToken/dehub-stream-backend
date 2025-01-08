import { Injectable, UploadedFile } from '@nestjs/common';
import { addProperty, reqParam } from 'common/util/auth';
import { AccountModel } from 'models/Account';
import { Request, Response } from 'express';
import { MessageModel } from 'models/message/dm-messages';
import mongoose from 'mongoose';
import { DmModel } from 'models/message/DM';
import { PlansModel } from 'models/Plans';
import { SubscriptionModel } from 'models/subscription';
import { CdnService } from 'src/cdn/cdn.service';
import { JobService } from 'src/job/job.service';
import { UserReportModel } from 'models/user-report';
import { MessageTransactions } from 'models/message/tip-and-transactions';
import { conversationPipeline } from './pipline';
@Injectable()
export class DMService {
  constructor(
    private readonly cdnService: CdnService,
    private readonly jobService: JobService,
  ) {}

  private checkIsAdmin(participants, adminId) {
    return participants.some(p => {
      const key2 = p.participant.toString();
      const key = adminId.toString();
      const role = p.role;
      return key === key2 && role === 'admin';
    });
  }
  private isUserInGroup(participants, userId) {
    return participants.some(p => p.participant.toString() === userId.toString());
  }
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

      // Prepare participants array
      const participants = users
        .filter(userId => userId !== creatorExists._id.toString()) // Exclude the creator from being added as a member
        .map(userId => ({
          participant: userId,
          role: 'member', // Default role for other members
        }));

      // Add the creator as an admin
      participants.push({
        participant: creatorExists._id.toString(),
        role: 'admin',
      });

      console.log('participants', participants);

      // Create the group chat in the database
      const newGroupChat = await DmModel.create({
        groupName,
        description: reqParam(req, 'description') || '', // Optional description
        participants: participants,
        conversationType: 'group',
        plans: [...validPlans], // Assuming only one plan can be associated with a group
        createdBy: creatorExists._id,
      });

      const pipeline: any = [
        // Match messages where the session user is part of the conversation
        {
          $match: {
            _id: newGroupChat._id,
            'participants.participant': creatorExists._id,
          },
        },
        ...conversationPipeline(creatorExists),
      ];

      // Execute aggregation using DmModel
      const dms = await DmModel.aggregate(pipeline);
      return res.status(201).json({
        success: true,
        message: 'Group chat created successfully!',
        data: dms[0],
      });
    } catch (error) {
      console.error('Error creating group chat:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while creating the group chat.',
      });
    }
  }
  async joinGroup(req: Request, res: Response) {
    try {
      // Parse input data
      const groupId = reqParam(req, 'groupId');
      const address = reqParam(req, 'address');
      const userAddress = reqParam(req, 'userAddress');
      const admin = await AccountModel.findOne({ address: address?.toLowerCase() }, { _id: 1 });
      const user = await AccountModel.findOne({ address: userAddress?.toLowerCase() }, { _id: 1 });
      const group = await DmModel.findById(groupId);
      const subs = await SubscriptionModel.findOne({ active: true, userId: user._id, planId: { $in: group.plans } });

      const isAdmin = this.checkIsAdmin(group.participants, admin._id);

      if (!group) {
        return res.status(404).json({ success: false, message: 'Group not found.' });
      }
      if (isAdmin) {
        const isAlreadyJoined = this.isUserInGroup(group.participants, admin._id);
        if (isAlreadyJoined) return res.status(400).json({ success: false, message: 'Already in the group.' });

        await DmModel.findOneAndUpdate(
          { _id: groupId },
          {
            $push: {
              participants: {
                role: 'member', // Assign default role as 'member'
                participant: user._id, // Add the user to the participants array
              },
            },
          },
          { new: true }, // Optionally returns the updated document
        );

        return res.status(400).json({ success: false, message: 'You are admin' });
      }

      if (!isAdmin && subs != null) {
        const isAlreadyJoined = this.isUserInGroup(group.participants, user._id);

        if (isAlreadyJoined) return res.status(400).json({ success: false, message: 'Already in the group.' });

        await DmModel.findOneAndUpdate(
          { _id: groupId },
          {
            $push: {
              participants: {
                role: 'member', // Assign default role as 'member'
                participant: user._id, // Add the user to the participants array
              },
            },
          },
          { new: true }, // Optionally returns the updated document
        );
        return res.status(200).json({
          success: true,
          message: 'User successfully joined the group.',
        });
      }
    } catch (error) {
      console.error('Error creating group chat:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while creating the group chat.',
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
  async getContactsByAddress(req: Request, res: Response) {
    const address = reqParam(req, 'address').toLowerCase();
    const user = await AccountModel.findOne({ address: address }, { _id: 1 });
    // Define your aggregation pipeline
    const pipeline: any = [
      // Match messages where the session user is part of the conversation
      {
        $match: {
          'participants.participant': user._id,
        },
      },
      ...conversationPipeline(user),
    ];

    // Execute aggregation using DmModel
    const dms = await DmModel.aggregate(pipeline);
    res.status(200).json(dms);
  }
  async uploadDm(req: Request, res: Response, files: { files: Express.Multer.File[] }) {
    const conversationId = reqParam(req, 'conversationId');
    const senderId = reqParam(req, 'senderId');
    const purchaseOptions = reqParam(req, 'purchaseOptions');
    const isPaid = reqParam(req, 'isPaid');
    console.log('purchaseOptions', purchaseOptions);

    const user = await AccountModel.findOne({ address: senderId.toLowerCase() }, { _id: 1 });
    const obj: any = {
      sender: user._id,
      conversation: conversationId,
      msgType: 'media',
      uploadStatus: 'pending',
      isRead: false,
      isPaid:false,
      isUnLocked:true
    };
    
    console.log('isPaid:',isPaid,obj)
    if (isPaid && purchaseOptions) {
      obj.isPaid = true;
      obj.isUnLocked = false;
      obj.purchaseOptions = JSON.parse(purchaseOptions);
    }
    // console.log('isPaid && purchaseOptions', obj);
    console.log('obj:',obj)
    const msg = await MessageModel.create(obj);

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
      const lastMessage = await MessageModel.findOne(
        {
          conversation: conversationId,
        },
        { _id: 1 },
      )
        .sort({ createdAt: -1 }) // Assuming messages have a `createdAt` field
        .lean();
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
              lastMessage: lastMessage?._id,
            },
          },
          { new: true, upsert: true }, // Create a new document if one doesn't exist
        );

        return res.status(200).json({
          message: 'Group successfully blocked.',
          blocked: true,
          conversationId: conversationId,
          reportId: updatedReport._id,
          success: true,
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
            lastMessage: lastMessage._id,
          },
        },
        { new: true, upsert: true }, // Create a new document if one doesn't exist
      );

      return res.status(200).json({
        message: 'User successfully blocked in the DM.',
        blocked: true,
        success: true,
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
  async blockGroupUser(req: Request, res: Response) {
    try {
      // Extract request parameters
      const conversationId = reqParam(req, 'conversationId');
      const reason = reqParam(req, 'reason') || 'No reason provided';
      const address = reqParam(req, 'address');
      const userAddress = reqParam(req, 'userAddress');

      // Fetch the reporter and reported user accounts
      const [reportedBy, reportedUser] = await Promise.all([
        AccountModel.findOne({ address: address.toLowerCase() }, { _id: 1 }),
        AccountModel.findOne({ address: userAddress.toLowerCase() }, { _id: 1 }),
      ]);

      if (!reportedBy || !reportedUser) {
        return res.status(404).json({
          error: !reportedBy ? 'User not found' : 'Reported User not found',
        });
      }

      // Fetch the conversation and validate admin access
      const conversation = await DmModel.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const isAdmin = conversation.participants.some(
        p => p.role === 'admin' && p.participant.toString() === reportedBy._id.toString(),
      );

      if (!isAdmin) {
        return res.status(403).json({
          message: "You don't have access to block the user.",
          blocked: false,
          conversationId,
          success: false,
        });
      }

      // Check for existing block entry
      const existingBlock = await UserReportModel.findOne({
        conversation: conversationId,
        userReportedBy: reportedBy._id,
        reportedUser: reportedUser._id,
        action: 'block',
      });

      if (existingBlock) {
        return res.status(400).json({
          error: 'You have already blocked this conversation or user.',
        });
      }

      // Fetch the last message in the conversation
      const lastMessage = await MessageModel.findOne({ conversation: conversationId }, { _id: 1 })
        .sort({ createdAt: -1 })
        .lean();

      // Handle group block
      if (conversation.conversationType === 'group') {
        const updatedReport = await UserReportModel.findOneAndUpdate(
          {
            conversation: conversationId,
            userReportedBy: reportedBy._id,
          },
          {
            $set: {
              action: 'block',
              reason,
              resolved: false,
              isGlobal: false,
              reportedUser: reportedUser._id,
              conversation: conversationId,
              lastMessage: lastMessage?._id || null, // Handle potential null value
            },
          },
          { new: true, upsert: true }, // Create a new document if it doesn't exist
        );

        return res.status(200).json({
          message: 'Group successfully blocked.',
          blocked: true,
          conversationId,
          reportId: updatedReport._id,
          success: true,
        });
      }

      // Invalid request for non-group conversations
      return res.status(400).json({
        message: 'Invalid Request',
        blocked: false,
        conversationId,
        success: false,
      });
    } catch (error) {
      console.error('Error in blockGroupUser:', error);
      return res.status(500).json({
        error: 'An error occurred while processing your request.',
      });
    }
  }
  async unBlockDm(req: Request, res: Response) {
    try {
      const conversationId = reqParam(req, 'conversationId'); // Get conversation ID from request
      const address = reqParam(req, 'address'); // Get user's address from request
      const reportId = reqParam(req, 'reportId'); // Get user's address from request

      console.log('object', { conversationId, address });
      const user = await AccountModel.findOne({ address: address.toLowerCase() });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const conversation = await DmModel.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Check if a block entry exists
      const existingBlock = await UserReportModel.findOne({
        $or: [
          {
            _id: reportId,
          },
          {
            conversation: conversationId,
            reportedBy: user._id,
            action: 'block',
          },
        ],
      });

      if (!existingBlock) {
        return res.status(400).json({
          error: 'This conversation or user is not currently blocked.',
        });
      }

      // If conversation type is group, unblock the group
      if (conversation.conversationType === 'group') {
        const updatedReport = await UserReportModel.findOneAndUpdate(
          {
            conversation: conversationId,
            reportedBy: user._id,
          },
          {
            $set: {
              action: 'unblock',
              resolved: true,
            },
          },
          { new: true },
        );
        const out = {
          message: 'Group successfully unblocked.',
          unblocked: true,
          conversationId: conversationId,
          reportId: updatedReport._id,
          success: true,
        };
        console.log(out);
        return res.status(200).json(out);
      }

      // For DM, find the other participant to unblock
      const reportedUserId = conversation.participants.find(
        participantId => participantId.toString() !== user._id.toString(),
      );

      if (!reportedUserId) {
        return res.status(404).json({ error: 'No other user found in this conversation.' });
      }

      // Update or create an unblock entry for the DM
      const updatedReport = await UserReportModel.findOneAndUpdate(
        {
          conversation: conversationId,
          reportedBy: user._id,
        },
        {
          $set: {
            action: 'unblock',
            resolved: true,
          },
        },
        { new: true },
      );

      return res.status(200).json({
        message: 'User successfully unblocked in the DM.',
        unblocked: true,
        success: true,
        conversationId: conversationId,
        reportId: updatedReport._id,
      });
    } catch (error) {
      console.error('Error in unBlockDm:', error);
      return res.status(500).json({
        error: 'An error occurred while processing your request.',
      });
    }
  }
  async getVideoStream(req: Request, res: Response) {
    res.status(400).json({ success: false, message: 'getVideoStream  not completed yat.' });
  }
  async getContact(req: Request, res: Response) {
    const filters: any = {};

    addProperty(req, filters, 'id');
    addProperty(req, filters, 'conversationType');
    addProperty(req, filters, 'groupName');
    addProperty(req, filters, 'participant');
    addProperty(req, filters, 'role');
    addProperty(req, filters, 'lastMessageAtFrom');
    addProperty(req, filters, 'lastMessageAtTo');
    addProperty(req, filters, 'planId');
    const query: any = {};
    // Apply filters dynamically
    if (filters.conversationType) {
      query.conversationType = filters.conversationType;
    }

    if (filters.groupName) {
      query.groupName = { $regex: filters.groupName, $options: 'i' }; // Case-insensitive search
    }
    if (filters.createdBy) {
      query.createdBy = filters.createdBy;
    }
    if (filters.participant) {
      query['participants.participant'] = filters.participant;
    }
    if (filters.role) {
      query['participants.role'] = filters.role;
    }
    if (filters.lastMessageAtFrom || filters.lastMessageAtTo) {
      query.lastMessageAt = {};
      if (filters.lastMessageAtFrom) {
        query.lastMessageAt.$gte = new Date(filters.lastMessageAtFrom);
      }
      if (filters.lastMessageAtTo) {
        query.lastMessageAt.$lte = new Date(filters.lastMessageAtTo);
      }
    }
    return res.status(200).json({ data: DmModel.find(query) });
  }
  async getContactByPlanId(req: Request, res: Response) {
    try {
      const planId = reqParam(req, 'planId');
      const plan: any & { _id: any } = await PlansModel.findOne({ id: planId }, { _id: 1 });
      if (!plan) {
        return res.status(404).json({ message: 'Plan not Found.' });
      }
      const dm = await DmModel.aggregate([
        {
          $match: {
            plans: { $in: [plan?._id] },
          },
        },
        {
          $project: {
            _id: 1,
            groupName: 1,
            sendParticipantCount: { $size: '$participants' }, // Replace "participants" with the actual field name
          },
        },
      ]);
      if (!dm) {
        return res.status(404).json({ message: 'DM not found for the given Plan ID' });
      }

      return res.status(200).json(dm);
    } catch (error) {
      console.error('Error fetching DM by Plan ID:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
  async addTnx(req: Request, res: Response) {
    const { messageId, senderAddress, receiverAddress, transactionHash, status,amount, type, chainId } = req.body;

    // Validate the required fields
    if (!senderAddress || !receiverAddress || !transactionHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: senderAddress, receiverAddress, or transactionHash.',
      });
    }

    // Create a new message transaction
    const newMessage = new MessageTransactions({
      messageId,
      senderAddress,
      receiverAddress,
      transactionHash,
      amount,
      chainId,
      type,
      status: status || 'init', // Default status
    });

    try {
      // Save to database
      const savedMessage = await newMessage.save();

      // Respond with success
      return res.status(201).json({
        success: true,
        data: savedMessage,
      });
    } catch (error) {
      // Handle potential errors during save
      return res.status(500).json({
        success: false,
        message: 'Failed to save the transaction.',
        error: error.message,
      });
    }
  }
  async updateTnx(req: Request, res: Response) {
    const { tnxId, status, tnxHash } = req.body;

    // Validate the required fields
    if (!tnxId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: messageId and status.',
      });
    }

    try {
      // Find the message by its ID and update the status
      const updatedMessage = await MessageTransactions.findOneAndUpdate(
        { $or: [{ _id: tnxId, transactionHash: tnxHash }, { transactionHash: tnxHash }] },
        { status },
        { new: true }, // Return the updated document
      );

      await MessageModel.findByIdAndUpdate(updatedMessage.messageId, {
        isUnLocked: true,
      });
      // If the message does not exist, respond with an error
      if (!updatedMessage) {
        return res.status(404).json({
          success: false,
          message: 'Message not found with the provided messageId.',
        });
      }

      // Respond with the updated message
      return res.status(200).json({
        success: true,
        data: {
          tnxId,
          messageId: updatedMessage.messageId,
          isUnLocked: true,
        },
      });
    } catch (error) {
      // Handle errors
      return res.status(500).json({
        success: false,
        message: 'Failed to update the status.',
        error: error.message,
      });
    }
  }
  async removeUserFromGroup(req: Request, res: Response) {}
}
