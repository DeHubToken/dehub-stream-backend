import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { overrideOptions, paramNames, RewardType, supportedTokens } from 'config/constants';
import { isAddress } from 'ethers';
import { Request, Response } from 'express';
import { isValidTipAmount } from 'common/util/validation';
import { normalizeAddress } from 'common/util/format';
import { CommentModel } from 'models/Comment';
import Reward from 'models/Reward';
import { Balance } from 'models/Balance';
import {config} from 'config';
import { Feature } from 'models/Feature';
import { VoteModel } from 'models/Vote';
import { NotificationsService } from 'src/notification/notification.service';
import { LikedVideos } from 'models/LikedVideos';
import { UserService } from 'src/user/user.service';
import { TokenModel } from 'models/Token';
import Reaction from 'models/Reaction';

@Injectable()
export class ReactionService {
  constructor(
    private readonly notificationService: NotificationsService,
    private readonly userService: UserService
  ){}
  
  async requestLike (req:Request, res:Response) {
    const address = reqParam(req, paramNames.address);
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      streamTokenId = parseInt(streamTokenId, 10);
      const result = await this.requestLikeFunc(address, streamTokenId);
      return res.json(result);
    } catch (err) {
      console.log('-----request like error', err);
      return res.status(500).json({ result: false, error: 'Like request failed' });
    }
  }
  
  async requestTip (req:Request, res:Response) {
    const address = reqParam(req, paramNames.address);
    let amount = reqParam(req, 'amount');
    let chainId = reqParam(req, 'chainId');
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      amount = Number(amount);
      chainId = parseInt(chainId, 10);
      if (!isValidTipAmount(amount))
        return res.status(400).json({ error: true, message: 'Bad request: Invalid tip amount!' });
      streamTokenId = parseInt(streamTokenId, 10);
      const owner = await TokenModel.findOne({ tokenId: streamTokenId }, {}).lean();
      const result = await this.requestTipFunc(address, streamTokenId, amount, chainId);
      await this.notificationService.createNotificationfunc(normalizeAddress(owner.owner), 'tip', {
        senderAddress: normalizeAddress(address),
        tipAmount: amount,
      });
      return res.json(result);
    } catch (err) {
      console.log('-----request tip error', err);
      return res.status(500).json({ result: false, error: 'Tip failed' });
    }
  }

  async requestComment (req, res) {
    const address = reqParam(req, paramNames.address);
    let content = reqParam(req, 'content');
    let commentId = reqParam(req, 'commentId');
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      if (!content) return res.status(400).json({ error: true, message: 'Comment content is required' });
      streamTokenId = parseInt(streamTokenId, 10);
      commentId = commentId ? parseInt(commentId, 10) : undefined;
      const owner = await TokenModel.findOne({ tokenId: streamTokenId }, {}).lean();
      const result = await this.requestCommentFunc(address, streamTokenId, content, commentId);
      // notify owner
      await this.notificationService.createNotificationfunc(normalizeAddress(owner.owner), 'comment', {
        tokenId: streamTokenId,
        senderAddress: normalizeAddress(address),
      });
      return res.json(result);
    } catch (err) {
      console.log('-----request comment error', err);
      return res.status(500).json({ result: false, error: 'Comment failed' });
    }
  }

  async requestVote (req, res) {
    const address = reqParam(req, paramNames.address);
    const vote = reqParam(req, 'vote'); // 'true' => yes or 'false' => no
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      if (!vote) return res.status(400).json({ error: true, message: 'Vote params is required' });
      streamTokenId = parseInt(streamTokenId, 10);
      const owner = await TokenModel.findOne({ tokenId: streamTokenId }, {}).lean();
      const result = await this.requestVoteFunc(address, streamTokenId, vote.toString());
      // notify owner
      await this.notificationService.createNotificationfunc(
        normalizeAddress(owner.owner),
        vote === 'true' ? 'like' : 'dislike',
        {
          tokenId: streamTokenId,
          senderAddress: normalizeAddress(address),
        },
      );
      // Add to liked videos
      if (vote === 'true') {
        const payload = new LikedVideos({
          address: normalizeAddress(address),
          tokenId: streamTokenId,
        })
        await payload.save()
      }
      return res.json(result);
    } catch (err) {
      console.log('-----request vote error', err);
      return res.status(500).json({ result: false, error: 'Voting failed' });
    }
  }
  async requestFollow (req, res) {
    const address = reqParam(req, paramNames.address);
    const following = reqParam(req, 'following');
    const unFollowing = reqParam(req, 'unFollowing');
    if (!following && !isAddress(following))
      return res.status(400).json({ error: 'Following params is required', message: 'Following params is required' });
    try {
      let result = undefined;
      if (unFollowing != 'true') {
        result = await this.requestFollow(address, following);
        await this.notificationService.createNotificationfunc(normalizeAddress(following), 'following', {
          senderAddress: normalizeAddress(address),
        });
      } else result = await this.userService.unFollow(address, following);
      return res.json(result);
    } catch (err) {
      console.log('-----request follow error', err);
      return res.status(500).json({ result: false, error: 'Following failed' });
    }
  }

   async requestReaction (req:Request, res:Response) {
    const address = reqParam(req, paramNames.address);
    const reactionType = reqParam(req, 'reactionType');
    const subjectType = reqParam(req, 'subjectType');
    const subjectId = reqParam(req, 'subjectId');
    if (!subjectId || !reactionType || !subjectType)
      return res
        .status(400)
        .json({ error: true, message: 'address, reactionType, subjectType and subjectId are required' });
    try {
      const result = await this.requestReactionFunc({ address, subjectId, reactionType, subjectType });
      return res.json(result);
    } catch (err) {
      console.log('-----request reaction error', err);
      return res.status(500).json({ result: false, error: err.message || 'Reaction failed' });
    }
  }

  async getReactions (req:Request, res:Response) {
    const subjectType = reqParam(req, 'subjectType');
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 200;
    const result = await Reaction.find({ subjectType }, { subjectId: 1, value: 1, type: 1, _id: 0 })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return res.json({ result });
  }

  // =======

  async requestReactionFunc(requestData) {
    const { subjectId, subjectType, reactionType, address } = requestData;
    const reaction = await Reaction.findOne({ type: reactionType, subjectType, subjectId });
    let result = null;
    const reactionOptions = { ...overrideOptions, fields: { value: 1, subjectId: 1, subjectType: 1, type: 1, _id: 0 } }
    if (!reaction || reaction.value === 0) {
        result = await Reaction.findOneAndUpdate({ subjectId, subjectType, type: reactionType }, { addresses: [address], value: 1 }, reactionOptions).lean();
    }
    else {
        if (reaction.addresses?.includes(address)) {
            if (reaction.value <= 1)
                await Reaction.deleteOne({ subjectId, subjectType, type: reactionType });
            else
                result = await Reaction.findOneAndUpdate({ subjectId, subjectType, type: reactionType }, { $pull: { addresses: address }, $inc: { value: -1 } }, reactionOptions).lean();
        }
        else
            result = await Reaction.findOneAndUpdate({ subjectId, subjectType, type: reactionType }, { $push: { addresses: address }, $inc: { value: 1 } }, reactionOptions).lean();
    }
    return { result };
}

 async requestTipFunc(account, tokenId, tipAmount, chainId) {
    const nftStreamItem = await TokenModel.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };
    const tokenItem = supportedTokens.find(e => e.symbol === config.defaultTokenSymbol && e.chainId === chainId);
    const tokenAddress = normalizeAddress(tokenItem.address);
    const sender = normalizeAddress(account);
    const balanceItem = await Balance.findOne({ address: sender, tokenAddress, chainId, }, { balance: 1 });
    if (!balanceItem?.balance || balanceItem.balance < tipAmount) return { result: false, error: 'Deposit or buy more tokens in the profile section' };
    if (nftStreamItem.owner === sender) return { result: false, error: `Can't tip for stream owned by yourself` };
    if (nftStreamItem.owner) {
        await Balance.updateOne({ address: sender, tokenAddress, chainId },
            { $inc: { balance: -tipAmount, sentTips: tipAmount } });
        await Balance.updateOne({ address: nftStreamItem.owner, tokenAddress, chainId },
            { $inc: { balance: tipAmount, paidTips: tipAmount } });
        await Reward.create({ address: nftStreamItem.owner, rewardAmount: tipAmount, tokenId, from: sender, chainId, type: RewardType.Tip });
        await TokenModel.updateOne({ tokenId }, { $inc: { totalTips: tipAmount } });
    }
    return { result: true };
}

 async requestCommentFunc(account, tokenId, content, commentId) {
    const nftStreamItem = await TokenModel.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };
    account = normalizeAddress(account);
    if (commentId) { // reply
        const commentItem = await CommentModel.findOne({ id: commentId }, { tokenId: 1 }).lean();
        if (commentItem?.tokenId != tokenId) return { result: false, error: 'invalid comment' };
        const createdComment = await CommentModel.create({ tokenId, address: account, content, parentId: commentId });
        await CommentModel.updateOne({ id: commentId }, { $push: { replyIds: createdComment.id } });
    }
    else {
        await CommentModel.create({ tokenId, address: account, content });
    }
    // claim on chain
    // await payBounty(account, tokenId, RewardType.BountyForCommentor);
    return { result: true };
}

 async requestLikeFunc(account, tokenId){
  const nftStreamItem = await TokenModel.findOne({ tokenId }, {}).lean();
  if (!nftStreamItem) return { result: false, error: 'This stream no exist' };
  const likeItem = await Feature.findOne({ tokenId, address: normalizeAddress(account) });
  if (likeItem) return { result: false, error: 'Already you marked like' };
  await Feature.create({ tokenId, address: normalizeAddress(account) });
  await TokenModel.updateOne({ tokenId }, { $inc: { likes: 1 } });
  return { result: true };
}

async requestVoteFunc(account, tokenId, vote){
  account = normalizeAddress(account);
  const voteItem = await VoteModel.findOne({ address: account, tokenId }, { vote: 1 }).lean();
  if (voteItem) return { result: false, error: `already voted ${voteItem.vote ? 'yes' : 'no'}` };

  const nftStreamItem = await TokenModel.findOne({ tokenId }, {}).lean();
  if (!nftStreamItem) return { result: false, error: 'This stream no exist' };

  await VoteModel.create({ address: account, tokenId, vote: vote === 'true' ? true : false });
  const updateTokenOption = {};
  updateTokenOption[vote === 'true' ? 'totalVotes.for' : 'totalVotes.against'] = 1;
  await TokenModel.updateOne({ tokenId }, { $inc: updateTokenOption }, overrideOptions);
  console.log('-- voted', account, tokenId, vote);
  return { result: true };
};
}
