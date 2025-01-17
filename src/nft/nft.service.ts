import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { ethers, solidityPackedKeccak256 } from 'ethers'; // Import ethers
import { arrayify, splitSignature } from '@ethersproject/bytes';
import { CdnService } from '../cdn/cdn.service';
import { TokenModel } from 'models/Token';
import { normalizeAddress } from 'common/util/format';
import { paramNames, streamCollectionAddresses, streamInfoKeys, tokenTemplate } from 'config/constants';
import { eligibleBountyForAccount, isValidSearch, removeDuplicatedElementsFromArray } from 'common/util/validation';
import { CategoryModel } from 'models/Category';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { config } from 'config';
import { reqParam } from 'common/util/auth';
import { WatchHistoryModel } from 'models/WatchHistory';
import { CommentModel } from 'models/Comment';
import { PPVTransactionModel } from 'models/PPVTransaction';
import { LikedVideos } from 'models/LikedVideos';
import { streamControllerContractAddresses } from 'config/constants';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import { defaultVideoFilePath } from 'common/util/file';
import { statSync } from 'fs';
import { JobService } from 'src/job/job.service';
import { VoteModel } from 'models/Vote';
import sharp from 'sharp';
import { StreamActivityType, StreamStatus } from 'config/constants';
import { InjectModel } from '@nestjs/mongoose';
import { LiveStream, StreamDocument } from 'models/LiveStream';
import { Model } from 'mongoose';

const signer = new ethers.Wallet(process.env.SIGNER_KEY || '');

@Injectable()
export class NftService {
  constructor(
    private readonly cdnService: CdnService,
    private readonly jobService: JobService,
    @InjectModel(LiveStream.name) private livestreamModel: Model<StreamDocument>,
  ) {}

  async getAllNfts(req: Request, res: Response) {
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 1000;
    const filter = { status: 'minted' };
    const totalCount = await TokenModel.countDocuments(filter, tokenTemplate);
    const all = await this.getStreamNfts(filter, skip, limit);
    return res.json({ result: { items: all, totalCount, skip, limit } });
  }

  async getMyNfts(req: Request, res: Response) {
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 1000;
    const owner = req.body.owner || req.query.owner;
    if (!owner) return res.status(400).json({ error: 'Owner field is required' });
    // const filter = { status: 'minted', $or: [{ owner: owner.toLowerCase() }, { minter: owner.toLowerCase() }] };
    const filter = { status: 'minted', minter: owner.toLowerCase() };
    const totalCount = await TokenModel.countDocuments(filter, tokenTemplate);
    const all = await TokenModel.find(filter, tokenTemplate).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
    return res.json({ result: { items: all, totalCount, skip, limit } });
  }

  async mintNFT(
    videoFile: Express.Multer.File,
    imageFile: Express.Multer.File,
    name: string,
    description: string,
    streamInfo: any, // Adjust the type based on your streamInfo structure
    address: string,
    chainId: number,
    category: string[],
  ): Promise<any> {
    // Adjust the return type based on what signatureForMintingNFT returns

    // Call the signatureForMintingNFT method with the uploaded URLs

    const { res, video }: any = await this.signatureForMintingNFT(
      name,
      description,
      streamInfo,
      address,
      chainId,
      category,
    );

    const imageUrl = await this.cdnService.uploadFile(imageFile.buffer, 'images', video?.tokenId?.toString() + '.jpg');

    console.log('here', imageUrl, video?.tokenId.toString());

    await this.jobService.addUploadAndTranscodeJob(
      videoFile.buffer,
      address,
      videoFile.originalname,
      videoFile.mimetype,
      video.id,
      imageUrl,
    );
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
  ) {
    const collectionAddress = normalizeAddress(streamCollectionAddresses[chainId]);
    address = normalizeAddress(address);
    let imageExt = 'jpg';

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
    return { res, video: tokenItem };
  }

  async getStreamNfts(filter: any, skip: number, limit: number, sortOption = null) {
    try {
      const query = [
        {
          $match: filter,
        },
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
              {
                $match: {
                  tokenAddress: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d',
                },
              },
              {
                $project: {
                  staked: 1,
                  _id: 0,
                },
              },
            ],
            as: 'balance',
          },
        },
        {
          $project: {
            ...tokenTemplate,
            mintername: { $first: '$account.username' },
            minterDisplayName: { $first: '$account.displayName' },
            minterAvatarUrl: { $first: '$account.avatarImageUrl' },
            minterStaked: { $first: '$balance.staked' },
          },
        },
        {
          $sort: sortOption
            ? sortOption
            : {
                createdAt: -1,
              },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ];
      const result = await TokenModel.aggregate(query);
      return result;
    } catch (err) {
      console.log('-----get stream nfts:', err);
      return { result: false, error: 'fetching was failed' };
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
        address, // Add address to the destructured query parameters
      }: any = req.query;
      const searchQuery: any = {};
      if (!unit) unit = 20;
      if (unit > 100) unit = 100;

      let sortRule: any = { createdAt: -1 };
      searchQuery['$match'] = {
        $and: [{ status: 'minted' }, { $or: [{ isHidden: false }, { isHidden: { $exists: false } }] }],
      };

      console.log('Range - sotMode - unit - page - search', range, sortMode, unit, page, search);
      switch (sortMode) {
        case 'live':
          const liveQuery: any = {
            status: { $in: [StreamStatus.LIVE, StreamStatus.SCHEDULED] },
          };

          if (search) {
            break;
          }
          if (owner) liveQuery.address = owner.toLowerCase();

          const liveStreams = await this.livestreamModel
            .find(liveQuery)
            .sort(sortRule)
            .skip(unit * page)
            .limit(unit);

          const accounts = await AccountModel.find({
            address: { $in: liveStreams.map(stream => stream.address.toLowerCase()) },
          });

          const augmentedLiveStreams = liveStreams.map(stream => {
            const account = accounts.find(acc => acc.address.toLowerCase() === stream.address.toLowerCase());

            return {
              ...stream.toObject(),
              account: account
                ? {
                    username: account.username,
                    displayName: account.displayName,
                    avatarImageUrl: account.avatarImageUrl,
                  }
                : null,
            };
          });

          return res.send({ result: augmentedLiveStreams });
          break;
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
        const accounts = await AccountModel.find({
          username: { $regex: new RegExp(search, 'i') },
        });

        // search throuh livestreams
        const livestreamQuery: any = {
          $or: [{ title: re }, { description: re }],
        };

        const livestreams = await this.livestreamModel
          .find(livestreamQuery)
          .sort(sortRule)
          .skip(unit * page)
          .limit(unit);

        const videos: any = await this.getStreamNfts(
          searchQuery['$match'],
          unit * page,
          unit * page + unit * 1,
          sortRule,
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
            livestreams,
          },
        });
      }

      const ret: any = await this.getStreamNfts(searchQuery['$match'], unit * page, unit * page + unit * 1, sortRule);
      // Include userLike logic
      for (let nft of ret) {
        const userLike = await VoteModel.findOne({
          tokenId: nft.tokenId,
          address,
        });
        nft.isLiked = Boolean(userLike);
      }
      res.send({ result: ret });
    } catch (e) {
      console.log('   ...', new Date(), ' -- index/tokens-search err: ', e);
      res.status(500).send({ error: e.message });
    }
  }

  async getMyWatchedNfts(req: Request, res: Response) {
    let watcherAddress: any = req.query.watcherAddress || req.query.watcherAddress;
    const category = reqParam(req, 'category');
    if (!watcherAddress) return res.status(400).json({ error: 'Watcher address is required' });
    watcherAddress = watcherAddress.toLowerCase();
    const watchedTokenIds = await WatchHistoryModel.find({ watcherAddress }).limit(20).distinct('tokenId');
    if (!watchedTokenIds || watchedTokenIds.length < 1) return res.json({ result: [] });
    const myWatchedNfts: any = await this.getStreamNfts(
      { tokenId: { $in: watchedTokenIds }, category: category ? { $elemMatch: { $eq: category } } : null },
      0,
      20,
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
    const nftInfo = (await this.getStreamNfts({ tokenId: Number(tokenId) }, 0, 1))?.[0];
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
