import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { ethers, solidityPackedKeccak256 } from 'ethers'; // Import ethers
import { arrayify, splitSignature } from '@ethersproject/bytes';
import { CdnService } from '../cdn/cdn.service';
import { TokenModel } from 'models/Token';
import SavedPost from 'models/SavedPost';
import { normalizeAddress } from 'common/util/format';
import { paramNames, streamCollectionAddresses, streamInfoKeys, tokenTemplate } from 'config/constants';
import {
  eligibleBountyForAccount,
  getIsSubscriptionRequired,
  isUnlockedLockedContent,
  isUnlockedPPVStream,
  isValidSearch,
  removeDuplicatedElementsFromArray,
} from 'common/util/validation';
import { CategoryModel } from 'models/Category';
import { Request, Response } from 'express';
import { AccountDocument, AccountModel } from 'models/Account';
import { config } from 'config';
import { reqParam } from 'common/util/auth';
import { WatchHistoryModel } from 'models/WatchHistory';
import { CommentModel } from 'models/Comment';
import { PPVTransactionModel } from 'models/PPVTransaction';
import { LikedVideos } from 'models/LikedVideos';
import { streamControllerContractAddresses } from 'config/constants';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import { defaultTokenImagePath, defaultVideoFilePath } from 'common/util/file';
import { statSync } from 'fs';
import { JobService } from 'src/job/job.service';
import { VoteModel } from 'models/Vote';
import sharp from 'sharp';
import axios from 'axios';
const signer = new ethers.Wallet(process.env.SIGNER_KEY || '');

@Injectable()
export class NftService {
  constructor(
    private readonly cdnService: CdnService,
    private readonly jobService: JobService,
  ) {}

  async getAllNfts(req: Request, res: Response) {
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 1000;
    const postType = req.body.postType || req.query.postType || 'video';
    console.log('getAllNfts', postType);
    const filter = { status: 'minted', postType };
    const totalCount = await TokenModel.countDocuments(filter, tokenTemplate);
    const address = reqParam(req, 'address');
    const all = await this.getStreamNfts(filter, skip, limit, null, address);
    return res.json({ result: { items: all, totalCount, skip, limit } });
  }

  async getMyNfts(req: Request, res: Response) {
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 1000;
    const owner = req.body.owner || req.query.owner;
    const postType = req.body.postType || req.query.postType || 'video';
    if (!owner) return res.status(400).json({ error: 'Owner field is required' });
    // const filter = { status: 'minted', $or: [{ owner: owner.toLowerCase() }, { minter: owner.toLowerCase() }] };
    const filter = { status: 'minted', minter: owner.toLowerCase(), postType };
    const totalCount = await TokenModel.countDocuments(filter, tokenTemplate);
    const all = await TokenModel.find(filter, tokenTemplate).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
    return res.json({ result: { items: all, totalCount, skip, limit } });
  }

  async mintNFT(
    name: string,
    description: string,
    streamInfo: any, // Adjust the type based on your streamInfo structure
    address: string,
    chainId: number,
    category: string[],
    postType: string,
    plans: any,
    files: Express.Multer.File[],
  ): Promise<any> {
    // Adjust the return type based on what signatureForMintingNFT returns

    // Call the signatureForMintingNFT method with the uploaded URLs

    const { res, token }: any = await this.signatureForMintingNFT(
      name,
      description,
      streamInfo,
      address,
      chainId,
      category,
      postType,
      plans,
    );

    if (postType == 'feed-simple') {
      return res;
    }
    if (postType == 'feed-images') {
      const imageUrls = await Promise.all(
        files.map(async (image: Express.Multer.File, index: number) => {
          // const fileExtension = image.mimetype.split('/')[1]; // Ensure correct file extension
          const filename = `${token.tokenId}-${index + 1}.jpg`;
          await this.cdnService.uploadFile(image.buffer, address, filename);
          return `nfts/images/${filename}`;
        }),
      );
      // Filter out null values (in case some uploads failed)
      const filteredUrls = imageUrls.filter(url => url);
      // Update database
      await TokenModel.findOneAndUpdate({ _id: token._id }, { $set: { imageUrls: filteredUrls } });
      return res;
    }
    //clg type video
    console.log('type video');

    const imageUrl = await this.cdnService.uploadFile(files[1].buffer, address, token.tokenId + '.jpg');
    console.log('adding cron ');
    await this.jobService.addUploadAndTranscodeJob(
      files[0].buffer,
      address,
      files[0].originalname,
      files[0].mimetype,
      token._id,
      imageUrl,
    );

    console.log('if redis run then adding job and response is sending to client');
    return res;
  }

  async getCategories(res: Response) {
    try {
      let result = await CategoryModel.find({}, { _id: 0, name: 1 }).distinct('name');
      return res.json(result);
    } catch (err) {
      console.log('-----request follow error', err);
      return res.status(500).json({ result: false, error: 'Could not fetch catergories' });
    }
  }

  private async signatureForMintingNFT(
    name: string,
    description: string,
    streamInfo: any,
    address: string,
    chainId: number,
    category: any,
    postType: string,
    plans: any,
  ) {
    let imageExt = postType != 'feed-simple' ? 'jpg' : null;
    const collectionAddress = normalizeAddress(streamCollectionAddresses[chainId]);
    address = normalizeAddress(address);

    // Checking category
    if (category?.length > 0) {
      category = removeDuplicatedElementsFromArray(JSON.parse(category));

      const categoryItems = await CategoryModel.find({ name: { $in: category } }).distinct('name');
      const newCategories = category.filter(uploadedCategory => !categoryItems.includes(uploadedCategory));

      if (newCategories.length > 0) {
        await CategoryModel.insertMany(newCategories.map(e => ({ name: e })));
      }
    }

    const addedOptions: Record<string, any> = {};

    // 1. Store lock for bounty
    if (streamInfo[streamInfoKeys.isAddBounty]) {
      const precision = 5;
      const bountyAmount = Math.round(streamInfo[streamInfoKeys.addBountyAmount] * 10 ** precision) / 10 ** precision;
      streamInfo[streamInfoKeys.addBountyAmount] = bountyAmount;
      addedOptions.lockedBounty = {
        viewer: streamInfo[streamInfoKeys.addBountyAmount] * streamInfo[streamInfoKeys.addBountyFirstXViewers],
        commentor: streamInfo[streamInfoKeys.addBountyAmount] * streamInfo[streamInfoKeys.addBountyFirstXComments],
      };
    }

    // 2. Create pending token
    const timestamp = Math.floor(Date.now() / 1000);
    const tokenItem = await TokenModel.create({
      contractAddress: collectionAddress,
      name,
      description,
      streamInfo,
      imageExt,
      chainId,
      category,
      postType,
      plans,
      minter: normalizeAddress(address),
      ...addedOptions,
    });
    // 4. Signature for minting token
    const totalSupply = 1000;
    const messageHash = solidityPackedKeccak256(
      ['address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [collectionAddress, tokenItem.tokenId, chainId, totalSupply, timestamp],
    );
    const { r, s, v } = splitSignature(await signer.signMessage(arrayify(messageHash)));
    const res: any = { r, s, v, createdTokenId: tokenItem.tokenId.toString(), timestamp };
    console.log('signature res:', res);
    return { res, token: tokenItem };
  }

  async getStreamNfts(filter: any, skip: number, limit: number, sortOption = null, subscriber) {
    try {
      const user: any = await AccountModel.findOne({ address: subscriber?.toLowerCase() });
      // if (!user?._id) {
      //   return { result: false, error: 'User not found or invalid' };
      // }

      const query = [
        { $match: filter },

        // Join plans collection
        {
          $lookup: {
            from: 'plans',
            localField: 'plans',
            foreignField: 'id',
            as: 'plansDetails',
          },
        },

        // Join subscriptions with date and userId checks
        {
          $lookup: {
            from: 'subscriptions',
            let: { planIds: '$plans' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$userId', user?._id] },
                      { $eq: ['$active', true] },
                      { $lte: ['$startDate', new Date()] },
                      { $gte: ['$endDate', new Date()] },
                    ],
                  },
                },
              },
              { $project: { planId: 1 } },
            ],
            as: 'userSubscriptions',
          },
        },

        // Add alreadySubscribed to plans
        {
          $addFields: {
            plansDetails: {
              $map: {
                input: '$plansDetails',
                as: 'plan',
                in: {
                  $mergeObjects: [
                    '$$plan',
                    {
                      alreadySubscribed: {
                        $in: ['$$plan._id', { $map: { input: '$userSubscriptions', as: 'sub', in: '$$sub.planId' } }],
                      },
                    },
                  ],
                },
              },
            },
          },
        },

        // Join account and balances collections
        {
          $lookup: {
            from: 'accounts',
            localField: 'minter',
            foreignField: 'address',
            as: 'account',
          },
        },
        {
          $lookup: {
            from: 'balances',
            localField: 'minter',
            foreignField: 'address',
            pipeline: [
              { $match: { tokenAddress: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d' } },
              { $project: { staked: 1, _id: 0 } },
            ],
            as: 'balance',
          },
        },

        // Final projection
        {
          $project: {
            ...tokenTemplate,
            plansDetails: 1,
            mintername: { $first: '$account.username' },
            minterDisplayName: { $first: '$account.displayName' },
            minterAvatarUrl: { $first: '$account.avatarImageUrl' },
            minterStaked: { $first: '$balance.staked' },
          },
        },

        // Sort, skip, and limit
        { $sort: sortOption || { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ];

      const result = await TokenModel.aggregate(query);
      return result;
    } catch (err) {
      console.log('-----get stream nfts:', err);
      return { result: false, error: 'Fetching failed' };
    }
  }

  async getFilteredNfts(req: Request, res: Response) {
    try {
      let {
        search,
        page,
        unit,
        sortMode,
        bulkIdList,
        verifiedOnly,
        isSales,
        minter,
        owner,
        category,
        range,
        address,
        postType = 'video', // Add address to the destructured query parameters
      }: any = req.query;
      const searchQuery: any = {};

      if (!unit) unit = 20;
      if (unit > 100) unit = 100;
      const postFilter = {};
      if (postType === 'feed') {
        postFilter['$or'] = [{ postType: 'feed-simple' }, { postType: 'feed-images' }];
      } else {
        postFilter['postType'] = postType;
        // postFilter['transcodingStatus'] = 'done';
      }

      console.log('sortMode', { sortMode, postType, searchQuery });
      let sortRule: any = { createdAt: -1 };
      searchQuery['$match'] = {
        $and: [{ status: 'minted' }, { $or: [{ isHidden: false }, { isHidden: { $exists: false } }] }, postFilter],
      };
      console.log('searchQuery', JSON.stringify(searchQuery));
      console.log('Range - sotMode - unit - page - search', range, sortMode, unit, page, search);
      switch (sortMode) {
        case 'trends':
          if (range) {
            let fromDate = new Date();
            switch (range) {
              case 'day':
                fromDate.setDate(fromDate.getDate() - 1);
                break;
              case 'week':
                fromDate.setDate(fromDate.getDate() - 7);
                break;
              case 'month':
                fromDate.setMonth(fromDate.getMonth() - 1);
                break;
              case 'year':
                fromDate.setFullYear(fromDate.getFullYear() - 1);
                break;
            }
            searchQuery['$match']['createdAt'] = { $gt: fromDate };
          }
          // else {
          // searchQuery['$match']['createdAt'] = { $gt: new Date(Date.now() - config.recentTimeDiff) };
          // }
          sortRule = { views: -1 };
          break;
        case 'new':
          if (range) {
            let fromDate = new Date();
            switch (range) {
              case 'day':
                fromDate.setDate(fromDate.getDate() - 1);
                break;
              case 'week':
                fromDate.setDate(fromDate.getDate() - 7);
                break;
              case 'month':
                fromDate.setMonth(fromDate.getMonth() - 1);
                break;
              case 'year':
                fromDate.setFullYear(fromDate.getFullYear() - 1);
                break;
            }
            searchQuery['$match']['createdAt'] = { $gt: fromDate };
          }
          // else {
          // searchQuery['$match']['createdAt'] = { $gt: new Date(Date.now() - config.recentTimeDiff) };
          // }
          break;
        case 'mostLiked':
          sortRule = { likes: -1 };
          break;
        case 'ppv':
          searchQuery['$match'][`streamInfo.${streamInfoKeys.isPayPerView}`] = true;
          break;
        case 'bounty':
          searchQuery['$match'][`streamInfo.${streamInfoKeys.isAddBounty}`] = true;
          break;
        case 'locked':
          searchQuery['$match'][`streamInfo.${streamInfoKeys.isLockContent}`] = true;
          break;
      }

      if (!page) page = 0;
      if (minter) searchQuery['$match'] = { minter: minter.toLowerCase() };
      if (owner) searchQuery['$match'] = { owner: owner.toLowerCase() };
      if (category) {
        searchQuery['$match']['category'] = { $elemMatch: { $eq: category } };
      }

      if (bulkIdList) {
        let idList = bulkIdList.split('-');
        if (idList.length > 0) {
          idList = idList.map(e => '0x' + e);
          searchQuery['$match'] = { id: { $in: idList } };
        }
      }

      if ((verifiedOnly + '').toLowerCase() === 'true' || verifiedOnly === '1') {
        searchQuery['$match'] = { ...searchQuery['$match'], verified: true };
      }

      if (search) {
        if (!isValidSearch(search)) return res.json({ result: [] });
        var re: any = new RegExp(search, 'gi');
        let orOptions: any = [{ name: re }, { description: re }, { owner: normalizeAddress(re) }];
        if (Number(search) > 0) orOptions.push({ tokenId: Number(search) });
        searchQuery['$match'] = { ...searchQuery['$match'], $or: orOptions };

        // Search through the accounts table
        const accounts = await AccountModel.find({ username: { $regex: new RegExp(search, 'i') } });
        const address = reqParam(req, 'address');
        const videos: any = await this.getStreamNfts(
          searchQuery['$match'],
          unit * page,
          unit * page + unit * 1,
          sortRule,
          address,
        );

        // Include userLike logic
        for (let video of videos) {
          const userLike = await VoteModel.findOne({
            tokenId: video.tokenId,
            address,
          });
          video.isLiked = Boolean(userLike);
        }

        return res.send({
          result: {
            accounts,
            videos,
          },
        });
      }
      const ret: any = await this.getStreamNfts(
        searchQuery['$match'],
        unit * page,
        unit * page + unit * 1,
        sortRule,
        address,
      );
      // Include userLike logic

      if (ret.length > 0) {
        for (let nft of ret) {
          const userLike = await VoteModel.findOne({ tokenId: nft?.tokenId, address: address?.toLowerCase() });
          nft.isLiked = Boolean(userLike);
        }
        const userSavedPromises = ret?.map(async nft => {
          const userSaved = await SavedPost?.findOne({ tokenId: nft?.tokenId, address: address?.toLowerCase() });
          nft.isSaved = Boolean(userSaved);
        });
        await Promise.all(userSavedPromises);
      }
      console.log("du=00")
      console.log('retretretret', ret);
      res.send({ result: ret });
    } catch (e) {
      console.log('   ...', new Date(), ' -- index/tokens-search err: ', e);
      res.status(500).send({ error: e.message });
    }
  }

  async getMyWatchedNfts(req: Request, res: Response) {
    let watcherAddress: any = req.query.watcherAddress || req.query.watcherAddress;
    let postType = req.query.postType || 'video';
    const category = reqParam(req, 'category');
    if (!watcherAddress) return res.status(400).json({ error: 'Watcher address is required' });
    watcherAddress = watcherAddress.toLowerCase();
    const watchedTokenIds = await WatchHistoryModel.find({ watcherAddress }).limit(20).distinct('tokenId');
    if (!watchedTokenIds || watchedTokenIds.length < 1) return res.json({ result: [] });
    const myWatchedNfts: any = await this.getStreamNfts(
      { tokenId: { $in: watchedTokenIds }, postType, category: category ? { $elemMatch: { $eq: category } } : null },
      0,
      20,
      null,
      watcherAddress,
    );
    // myWatchedNfts.map(e => {
    //   e.imageUrl = process.env.DEFAULT_DOMAIN + '/' + e.imageUrl;
    //   e.videoUrl = process.env.DEFAULT_DOMAIN + '/' + e.videoUrl;
    // })
    return res.json({ result: myWatchedNfts });
  }

  async getNftInfo(req: Request, res: Response) {
    let tokenId = req.query.id || req.query.id || req.params?.id;

    if (!tokenId) return res.status(400).json({ error: 'Bad request: No token id' });
    // const nftInfo = await Token.findOne({ tokenId }, tokenTemplate).lean();
    const address = reqParam(req, 'address');
    const nftInfo = (await this.getStreamNfts({ tokenId: Number(tokenId) }, 0, 1, null, address))?.[0];
    const userLike = await VoteModel.findOne({ tokenId, address: req.query?.address });
    if (!nftInfo) return res.status(404).json({ error: 'Not Found: NFT does not exist' });
    const comments = await this.commentsForTokenId(tokenId);
    nftInfo.comments = comments;
    return res.json({ result: { ...nftInfo, isLiked: Boolean(userLike) } });
  }

  async commentsForTokenId(tokenId: any) {
    const query: mongoose.PipelineStage[] = [
      {
        $match: {
          tokenId: Number(tokenId),
        },
      },
      {
        $lookup: {
          from: 'accounts',
          localField: 'address',
          foreignField: 'address',
          as: 'account',
        },
      },
      {
        $sort: {
          id: -1,
        },
      },
      {
        $limit: 50,
      },
      {
        $project: {
          _id: 0,
          address: 1,
          content: 1,
          account: 1,
          createdAt: 1,
          updatedAt: 1,
          parentId: 1,
          replyIds: 1,
          id: 1,
          tokenId: 1,
        },
      },
    ];
    let result = await CommentModel.aggregate(query);
    result.forEach(comment => {
      if (comment.account?.[0]) {
        comment.writor = {
          username: comment.account?.[0]?.username,
          avatarUrl: comment.account?.[0]?.avatarImageUrl
            ? process.env.DEFAULT_DOMAIN + '/' + comment.account?.[0]?.avatarImageUrl
            : undefined,
        };
        delete comment.account;
      }
    });
    return result;
  }

  async getUnlockedNfts(req: Request, res: Response) {
    /// walletAddress param can be username or address
    let walletAddress: any = req.query.id || req.query.id || req.params?.id;
    if (!walletAddress) return res.status(400).json({ error: 'Bad request: No wallet sent' });
    walletAddress = normalizeAddress(walletAddress);
    let accountInfo: any = {};
    const unlockedPPVStreams = await PPVTransactionModel.find(
      { address: walletAddress, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } },
      { streamTokenId: 1 },
    ).distinct('streamTokenId');
    accountInfo.unlocked = unlockedPPVStreams;
    return res.json({ result: accountInfo });
  }

  async createLikedVideo(req: Request, res: Response) {
    try {
      const { userId, type } = req.body;
      const existingLikedVideo = await LikedVideos.findOne({ userId, type });
      if (existingLikedVideo) {
        throw new Error('Video already liked');
      }
      const payload = new LikedVideos({
        address: userId,
        tokenId: type,
      });

      await payload.save();
      res.status(200).json({ message: 'Video added to liked videos' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getlikedVideos(req: Request, res: Response) {
    try {
      let address = reqParam(req, paramNames.address);
      const page = reqParam(req, 'page');
      const skip = (page - 1) * 20;
      try {
        address = address.toLowerCase();
        // Will be limited later
        // const result = await LikedVideos.find({ address }).sort({ createdAt: -1 }).skip(skip).limit(20).populate('tokenId');
        const result = await LikedVideos.find({ address }).sort({ createdAt: -1 }).lean();
        const updatedResult = await Promise.all(
          result.map(async video => {
            const token = await TokenModel.findOne({ tokenId: video.tokenId });
            return token;
          }),
        );
        res.status(200).json({ result: updatedResult });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  async removeLikedVideo(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const liked = await LikedVideos.findById(id);
      if (liked) {
        await LikedVideos.findByIdAndDelete(id);
      }

      res.status(200).json({ message: 'Liked Video deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateTokenVisibility(req: Request, res: Response) {
    try {
      const { isHidden, id } = req.body;

      // Validate input data
      if (!id || typeof isHidden === 'undefined') {
        return res.status(400).json({ result: false, error: 'Invalid data provided' });
      }

      // Find the token and update its visibility
      const updatedToken = await TokenModel.findOneAndUpdate(
        { tokenId: id },
        { isHidden },
        { new: true }, // Returns the updated document
      );

      // Check if the token was successfully found and updated
      if (!updatedToken) {
        return res.status(404).json({ result: false, error: 'Token not found' });
      }

      // Return the updated token
      return res.status(200).json({ result: true, data: updatedToken });
    } catch (e) {
      console.error('-----updateVisibility error:', e);
      return res.status(500).json({ result: false, error: 'Updating failed' });
    }
  }

  // ======= //
  async updateVideoInfo(tokenId: number, videoExt: string) {
    const videoFilePath = defaultVideoFilePath(tokenId);
    let videoInfo = undefined;
    try {
      videoInfo = await ffprobe(videoFilePath, { path: ffprobeStatic.path });
    } catch (e) {
      console.log('---ffprobe error', e);
      await TokenModel.updateOne({ tokenId: tokenId }, { transcodingStatus: 'failed' });
      return;
    }

    const videoStream = videoInfo?.streams?.find(e => e.codec_type === 'video');
    if (!videoStream) {
      console.log('not find video stream', tokenId);
      await TokenModel.updateOne({ tokenId: tokenId }, { transcodingStatus: 'failed' });
      return;
    }
    const videoDuration = videoStream.duration;
    const w = videoStream.width;
    const h = videoStream.height;
    let bitrate = Number(videoStream.bit_rate);
    const lang = videoStream.tags?.language;
    const audioStream = videoInfo?.streams?.find(e => e.codec_type === 'audio');
    let channelLayout = 'mono';
    if (audioStream) {
      channelLayout = audioStream.channel_layout;
      bitrate += Number(audioStream.bit_rate);
    }
    let updateTokenOption: any = {};
    let videoStat;
    try {
      videoStat = statSync(videoFilePath);
    } catch (e) {
      console.log('----error when fetching for video size', e);
    }
    const fileSize = videoStat?.size;
    if (
      videoExt === 'mp4' &&
      videoStream.start_time === '0.000000' &&
      videoStream.codec_name === 'h264' &&
      videoStream.is_avc === 'true'
    )
      updateTokenOption.transcodingStatus = 'done';

    updateTokenOption.videoDuration = videoDuration;
    updateTokenOption.videoInfo = { w, h, bitrate, channelLayout, lang, size: fileSize };
    updateTokenOption.videoExt = videoExt;
    await TokenModel.updateOne({ tokenId: tokenId }, updateTokenOption);
    console.log('updated video info', tokenId);
  }

  async savePost(tokenId: number, address: string) {
    try {
      // Find the user by their address (case-insensitive)
      const user = await AccountModel.findOne({ address: address?.toLowerCase() }, { _id: 1, address: 1 });

      // Check if the user exists
      if (!user) {
        console.log('User not found');
        return { status: 'error', message: 'User not found' };
      }

      // Check if the post is already saved by the user
      const existingPost = await SavedPost.findOne({
        tokenId: tokenId,
        userId: user._id,
        address: address?.toLowerCase(),
      });

      if (existingPost) {
        // If the post exists, remove it and return response that feed is unsaved
        await SavedPost.deleteOne({ tokenId: tokenId, userId: user._id, address: address?.toLowerCase() });

        console.log('Feed unsaved successfully');
        return { status: 'success', message: 'Feed unsaved' };
      } else {
        // If the post doesn't exist, save the new post and return response that feed is saved
        const newPost = new SavedPost({
          tokenId: tokenId,
          userId: user._id,
          address: address?.toLowerCase(),
        });

        await newPost.save();

        console.log('Feed saved successfully');
        return { status: 'success', message: 'Feed saved' };
      }
    } catch (error) {
      console.log('Error:', error);
      return { status: 'error', message: 'An error occurred', error: error.message };
    }
  }

  async getSignForClaimBounty(req: Request, res: Response) {
    const address = reqParam(req, paramNames.address);
    const tokenId = reqParam(req, 'tokenId');
    if (!address || !tokenId)
      return res.status(400).json({ result: false, error: 'Address and token ID are required' });
    const eligibleResult = await eligibleBountyForAccount(address, tokenId);
    const result: any = { error: false, result: {}, claimed: {} };
    if (eligibleResult?.viewer_claimed) result.result.viewer_claimed = true;
    if (eligibleResult?.commentor_claimed) result.result.commentor_claimed = true;

    if (eligibleResult.viewer) {
      const sigResult = await this.signatureForClaimBounty(address, tokenId, 0);
      result.result.viewer = sigResult;
    }
    if (eligibleResult.commentor) {
      const sigResult = await this.signatureForClaimBounty(address, tokenId, 1);
      result.result.commentor = sigResult;
    }
    if (result.result.viewer || result.result.commentor) return res.json(result);
    else {
      result.error = 'Not Eligible';
      return res.json(result);
    }
  }
  async getNftImage(req: Request, res: Response) {
    try {
      // console.log('Received request to fetch NFT image');

      // Retrieve tokenId from query or params
      const tokenId = req.query.id || req.params?.id;
      if (!tokenId) {
        console.log('Token ID is missing in request');
        return res.status(400).json({ error: 'Token ID is required' });
      }
      // console.log(`Token ID retrieved: ${tokenId}`);

      const address = reqParam(req, 'address');
      // console.log(`Address retrieved: ${address}`);

      // Extract token base ID (in case it's concatenated with some other string)
      const tk = tokenId.toString().split('-')[0];
      // console.log(`Extracted base token ID: ${tk}`);

      // Retrieve token from the database
      const token = await TokenModel.findOne({ tokenId: tk });
      if (!token) {
        console.log(`Token with ID ${tk} not found in database`);
        return res.status(404).json({ error: 'Token not found' });
      }
      // console.log('Token found:', token);
      const isOwner = token?.owner == address;
      // Extract stream info and check conditions for content
      const { isLockContent = false, isPayPerView = false }: any = token?.streamInfo;
      const { plans = null } = token;
      const isFree = !isLockContent && !isPayPerView && !plans;
      // console.log(`isLockContent: ${isLockContent}, isPayPerView: ${isPayPerView}, isFree: ${isFree}`);

      const { isSubscribed = false, planRequired = false } = await getIsSubscriptionRequired(token.tokenId, address);
      // console.log(`Subscription status: isSubscribed: ${isSubscribed}, planRequired: ${planRequired}`);

      // Check if PPV content is unlocked or not
      const isUnlockedPPV = isPayPerView ? await isUnlockedPPVStream(token.tokenId.toString(), address) : true;
      console.log(`PPV unlocked: ${isUnlockedPPV}`);

      // Check if locked content is unlocked or not
      const isUnlockedLocked = isLockContent ? await isUnlockedLockedContent(token.streamInfo, address) : true;
      // console.log(`Locked content unlocked: ${isUnlockedLocked}`);

      // Construct the API URL for the token image
      const apiUrl = defaultTokenImagePath(tokenId.toString(), token.minter);
      // console.log(`Constructed API URL for image: ${apiUrl}`);

      // Fetch the image from the API
      let imageBuffer;
      const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
      // console.log(`Fetched image from API, status: ${response.status}`);

      // Check if the response status is OK
      if (response.status !== 200) {
        console.log('Image not found on the server');
        return res.status(404).json({ error: 'Image not found on the server' });
      }
      imageBuffer = Buffer.from(response.data);
      // console.log('Image data received and converted to buffer');

      // Function to determine whether blur should be applied
      const shouldApplyBlur = () => {
        console.log({
          isOwner,
          isFree,
          isUnlockedLocked,
          isSubscribed,
        });
        const result = isOwner || isFree || isUnlockedLocked || isSubscribed;
        // const result = !(isFree || (isUnlockedPPV && !isSubscribed) || (isUnlockedLocked && !isSubscribed));
        // console.log(`Should apply blur: ${!result}`);
        return !result;
      };

      // Apply blur and compression if necessary
      let sendImage = imageBuffer;
      if (shouldApplyBlur()) {
        //   console.log('Applying blur and compression');
        const compressedImage = await makeBlurAndCompress(imageBuffer, { blur: 30, compress: 0 });
        sendImage = compressedImage;
      }

      // Send the image (compressed or not) as the response
      console.log('Sending image as response');
      res.set('Content-Type', 'image/jpg');
      res.send(sendImage);
    } catch (error) {
      console.error('Error in getNftImage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  private async signatureForClaimBounty(address: string, tokenId: number, bountyType: any) {
    console.log('------sig for bounty', address, tokenId, bountyType);
    const tokenItem = await TokenModel.findOne({ tokenId }, { chainId: 1, streamInfo: 1 }).lean();
    const chainId = tokenItem?.chainId || config.defaultChainId;
    const toSignForClaim = ethers.solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'uint256', 'uint8'],
      [streamControllerContractAddresses[chainId], address, chainId, tokenId, bountyType],
    );
    let signer = new ethers.Wallet(process.env.SIGNER_KEY);
    const { r, s, v } = splitSignature(await signer.signMessage(arrayify(toSignForClaim)));
    return { v, r, s };
  }

  async recordVideoView(watcherAddress, tokenId) {
    try {
      const existingEntry = await WatchHistoryModel.findOne({
        watcherAddress,
        tokenId,
        status: 'confirmed',
      });

      if (!existingEntry) {
        await new WatchHistoryModel({
          tokenId,
          watcherAddress,
          status: 'confirmed',
          watchedAt: new Date(),
        }).save();

        const tokenFilter = { tokenId };
        await TokenModel.updateOne(tokenFilter, { $inc: { views: 1 } });
        return { success: true };
      }

      // Always log the session, even if it's not a unique view
      await new WatchHistoryModel({
        tokenId,
        watcherAddress,
        status: 'session',
        startedAt: new Date(),
      }).save();

      // increment total views for each session
      const tokenFilter = { tokenId };
      await TokenModel.updateOne(tokenFilter, { $inc: { views: 1 } });
      return { success: true };
    } catch (error) {
      console.error('Error recording video view:', error);
      throw new Error('Could not record video view');
    }
  }
}

const makeBlurAndCompress = async (buffer, options) => {
  // Resize and compress the image
  const width = 800; // Set desired width, adjust as needed
  const compressedImage = await sharp(buffer)
    .blur(options.blur)
    .resize({ width }) // Resize while maintaining aspect ratio
    .toBuffer();
  return compressedImage;
};

const extractFromCookie = req => {
  const cookieKey = config.isDevMode ? 'data_dev' : 'data_v2';
  try {
    const cookie = req.cookies[cookieKey];

    if (cookie) {
      const parsedCookie = JSON.parse(cookie);
      // console.log('Parsed cookie:', parsedCookie);
      // Extract dynamic address
      const address = Object.keys(parsedCookie)[0]; // Get the dynamic address key
      const data = parsedCookie[address]; // Access the corresponding data for that address
      console.log(`Address: ${address}, Data:`, data);

      // You can now use 'address' and 'data' as needed
      req.params.address = address.toLowerCase();
      req.params.timestamp = data.timestamp;
      req.params.rawSig = data.sig;
    }
  } catch (error) {
    console.error('Error parsing cookie:', error.message);
  }
};
