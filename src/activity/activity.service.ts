import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { ActivityActionType, ActivityModel } from 'models/activity';
import { CommentDocument } from 'models/Comment';
import { IFollow } from 'models/Follow';
import { PlansDocument } from 'models/Plans';
import { SubscriptionDocument } from 'models/subscription';
import { PostActivityType, TokenDocument } from 'models/Token';
import { VoteDocument } from 'models/Vote';
import mongoose from 'mongoose';

@Injectable()
export class ActivityService {
  async onPlanPublished(plan: PlansDocument) {
    await new ActivityModel({
      planId: plan._id,
      userId: plan.userId,
      type: ActivityActionType.PLAN_PUBLISHED,
    }).save();
  }

  async onPlanCreate(plan: PlansDocument) {
    await new ActivityModel({
      planId: plan._id,
      userId: plan.userId,
      type: ActivityActionType.CREATE_PLAN,
    }).save();
  }

  async onPlanPurchased(subscription: SubscriptionDocument) {
    await new ActivityModel({
      planId: subscription.planId,
      userId: subscription.userId,
      type: ActivityActionType.PURCHASE_PLAN,
    }).save();
  }

  async onMint(token: TokenDocument) {
    if (!token.minter) return; // Ensure minter exists

    const user = await AccountModel.findOne({ address: token.minter.toLowerCase() });
    if (!user) return;

    await new ActivityModel({
      userId: user._id,
      tokenId: token.tokenId,
      type: PostActivityType[token.postType],
    }).save();
  }

  async onLikeAndDisLike(vote: VoteDocument) {
    const user = await AccountModel.findOne({ address: vote.address?.toLowerCase() });
    if (!user) return;
    await new ActivityModel({
      userId: user._id,
      tokenId: vote.tokenId,
      type: vote.vote === true ? ActivityActionType.LIKE : ActivityActionType.DIS_LIKE,
    }).save();
  }
  async onComment(comment: CommentDocument, isReply:boolean) {
    const user = await AccountModel.findOne({ address: comment.address?.toLowerCase() });
    if (!user) return;
    await new ActivityModel({
      userId: user._id,
      tokenId: comment.tokenId,
      type: isReply === true ? ActivityActionType.REPLY_ON_POST : ActivityActionType.COMMENT_ON_POST,
    }).save();
  }
  async onFollowAndUnFollow({ address, following }, state: boolean) {
    const user = await AccountModel.findOne({ address: address?.toLowerCase() });
    const user1 = await AccountModel.findOne({ address: following?.toLowerCase() });

    if (!user || !user1) return; // Ensure both users exist

    if (state) {
      // Follow
      await new ActivityModel({
        userId: user._id,
        following: user1._id,
        type: ActivityActionType.FOLLOW,
      }).save();
    } else {
      // Unfollow
      await ActivityModel.findOneAndDelete({ userId: user._id, following: user1._id });
    }
  }
  async fetchActivityByUser(req: Request, res: Response) {
    try {
      let id: string = reqParam(req, 'id');
      let limit: number = parseInt(reqParam(req, 'limit') ?? '100', 10);
      let skip: number = parseInt(reqParam(req, 'skip') ?? '0', 10);
      let user = null;

      // Determine whether `id` is an ObjectId or an address/username
      if (mongoose.Types.ObjectId.isValid(id)) {
        user = await AccountModel.findById(id).select('_id');
      } else {
        user = await AccountModel.findOne({
          $or: [{ address: id.toLowerCase() }, { username: id.toLowerCase() }],
        }).select('_id');
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Aggregation pipeline to fetch the latest activities first, then paginate
      const data = await ActivityModel.aggregate([
        { $match: { userId: user._id } }, // Filter by userId
        { $sort: { createdAt: -1 } }, // Sort by latest first
        { $skip: skip }, // Apply pagination (skip)
        { $limit: limit }, // Apply pagination (limit)
        {
          $lookup: {
            from: 'accounts',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $lookup: {
            from: 'accounts',
            localField: 'following',
            foreignField: '_id',
            as: 'followingUser',
          },
        },
        {
          $lookup: {
            from: 'plans',
            localField: 'planId',
            foreignField: '_id',
            as: 'plan',
          },
        },
        {
          $lookup: {
            from: 'tokens', // Ensure this matches the actual collection name
            localField: 'tokenId',
            foreignField: 'tokenId',
            as: 'nft',
          },
        },
        { $unwind: { path: '$tokens', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$followingUser', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            nft: 1,
            type: 1,
            createdAt: 1,
            'user._id': 1,
            'user.username': 1,
            'user.address': 1,
            'user.profileImage': 1,
            'followingUser.username': 1,
            'plan._id': 1,
            'plan.name': 1,
            'plan.price': 1,
            'plan.duration': 1,
          },
        },
      ]);

      return res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching activity:', error);
      return res.status(500).json({ message: 'Failed to get Activity', error: error.message });
    }
  }
}
