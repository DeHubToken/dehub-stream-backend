const { Account } = require('../models/Account');
const path = require('path');
require('dotenv').config();
const { reqParam } = require('../utils/auth');
const {
  paramNames,
  errorMsgs,
  userProfileKeys,
  overrideOptions,
  tokenTemplate,
  editableProfileKeys,
  streamInfoKeys,
} = require('../config/constants');
const { Token } = require('../models/Token');
const { checkFileType, normalizeAddress } = require('../utils/format');
const { signatureForMintingNFT } = require('./mintNft');
const {
  isValidTipAmount,
  eligibleBountyForAccount,
  isValidUsername,
  isValidSearch,
} = require('../utils/validation');
const { WatchHistory } = require('../models/WatchHistory');
const { config } = require('../config');
const { signatureForClaim, requestPPVStream, requestLike, requestTip, requestComment } = require('./user');
const { moveFile } = require('../utils/file');
const { Balance } = require('../models/Balance');
const { PPVTransaction } = require('../models/PPVTransaction');
const Feature = require('../models/Feature');
const { commentsForTokenId } = require('./comments');
const { requestVote } = require('./vote');
const { getLeaderboard, getStreamNfts } = require('./getData');
const { isAddress } = require('ethers/lib/utils');
const { requestFollow, unFollow, getFollowing, getFollowers } = require('./follow');
const { signatureForClaimBounty } = require('./bounty');
const { Category } = require('../models/Category');
const { Reaction } = require('../models/Reaction');
const { requestReaction } = require('./chat/reaction');
const notificationService = require('../services/NotificationService');
const likedVideoService = require('../services/LikedVideosService');
const { transcodeVideo } = require('../utils/stream');
const Vote = require('../models/Vote');

const accountTemplate = {
  username: 1,
  displayName: 1,
  balance: 1,
  address: 1,
  // deposited: 1,
  [userProfileKeys.avatarImageUrl]: 1,
  [userProfileKeys.coverImageUrl]: 1,
  [userProfileKeys.username]: 1,
  [userProfileKeys.aboutMe]: 1,
  [userProfileKeys.email]: 1,
  [userProfileKeys.facebookLink]: 1,
  [userProfileKeys.twitterLink]: 1,
  [userProfileKeys.discordLink]: 1,
  [userProfileKeys.instagramLink]: 1,
  [userProfileKeys.tiktokLink]: 1,
  [userProfileKeys.telegramLink]: 1,
  [userProfileKeys.youtubeLink]: 1,
  createdAt: 1,
  sentTips: 1,
  receivedTips: 1,
  uploads: 1,
  customs: 1,
  _id: 0,
};
const ApiController = {
  getServerTime: async function (req, res, next) {
    return res.json({ status: true, data: Math.floor(Date.now() / 1000), note: 's' });
  },
  signWithWallet: async function (req, res, next) {
    let address = reqParam(req, paramNames.address);
    address = address.toLowerCase();
    try {
      const account = await Account.findOneAndUpdate(
        { address },
        { lastLoginTimestamp: Date.now() },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      if (!account)
        return res.status(404).json({ status: false, error: true, error_message: 'Not Found: Account not found' });
      return res.json({
        status: true,
        result: { address: signedAddress, lastLoginTimestamp: account.lastLoginTimestamp },
      });
    } catch (e) {
      return res.status(500).json({ error: true, message: 'Sign Error' });
    }
  },
  login: async function (req, res, next) {
    let address = reqParam(req, paramNames.address);
    address = address.toLowerCase();
    try {
      const account = await Account.findOneAndUpdate(
        { address },
        { lastLoginTimestamp: Date.now() },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      if (!account)
        return res.status(404).json({ status: false, error: true, error_message: 'Not Found: Account not found' });
      return res.json({
        token: req.generatedToken,
        status: true,
        result: { address: address, lastLoginTimestamp: account.lastLoginTimestamp },
      });
    } catch (e) {
      console.log(e);
      return res.status(500).json({ error: true, message: 'Sign Error' });
    }
  },
  getSignedDataForUserMint: async function (req, res, next) {
    const { address, name, description, streamInfo, chainId, category } = req.body;
    console.log('upload:', name, description, streamInfo, chainId, JSON.parse(category));
    const uploadedFiles = req.files.files;
  
    // Set the response headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Flush headers to establish SSE connection
  
    if (uploadedFiles?.length < 2) {
      res.write(`data: ${JSON.stringify({ progress: 0, error: true, message: 'Both Image and Video files are needed' })}\n\n`);
      return res.end();
    }
  
    const videoFile = uploadedFiles[0];
    if (!checkFileType(videoFile)) {
      res.write(`data: ${JSON.stringify({ progress: 0, error: true, message: errorMsgs.not_supported_video })}\n\n`);
      return res.end();
    }
  
    const imageFile = uploadedFiles[1];
    if (!checkFileType(imageFile, 'image')) {
      res.write(`data: ${JSON.stringify({ progress: 0, error: true, message: errorMsgs.not_supported_image })}\n\n`);
      return res.end();
    }
  
    try {
      // Step 1: Minting signature process starts
      res.write(`data: ${JSON.stringify({ progress: 20, message: 'Minting signature process started...' })}\n\n`);
  
      const result = await signatureForMintingNFT(
        videoFile,
        imageFile,
        name,
        description,
        JSON.parse(streamInfo),
        address,
        Number(chainId),
        JSON.parse(category)
      );
  
      // Step 2: Signature creation completed
      console.log(result)
      
      if (result && result.createdTokenId) {
        try {
          res.write(`data: ${JSON.stringify({ progress: 50, message: 'Signature successfully created. Transcoding video...', result })}\n\n`);
          await transcodeVideo(result.createdTokenId, videoFile.mimetype.split('/')[1]);
          // Step 3: Transcoding completed successfully
          res.write(`data: ${JSON.stringify({ progress: 80, message: 'Transcoding completed successfully.' })}\n\n`);

        } catch (transcodeError) {
          res.write(`data: ${JSON.stringify({ progress: 80, error: true, message: 'Error during video transcoding' })}\n\n`);
        }
      }
  
      // Step 4: Final result sent to the client
      res.write(`data: ${JSON.stringify({ progress: 100, message: 'NFT minting process completed.', result })}\n\n`);
      res.write('data: [DONE]\n\n'); // Signal the end of streaming
      res.end();
    } catch (err) {
      console.error('-----getSignedDataForUserMint error', err);
      res.write(`data: ${JSON.stringify({ progress: 0, result: false, error: 'Uploading failed' })}\n\n`);
      res.end();
    }
  },
   
  updateTokenVisibility: async function (req, res) {
    try {
      const { isHidden, id } = req.body;
      
      // Validate input data
      if (!id || typeof isHidden === 'undefined') {
        return res.status(400).json({ result: false, error: 'Invalid data provided' });
      }
  
      // Find the token and update its visibility
      const updatedToken = await Token.findOneAndUpdate(
        {tokenId: id},
        { isHidden },
        { new: true } // Returns the updated document
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
  },  
  getAllNfts: async function (req, res, next) {
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 1000;
    const filter = { status: 'minted', isHidden: false };
    const totalCount = await Token.find(filter, tokenTemplate).count();
    const all = await getStreamNfts(filter, skip, limit);
    return res.json({ result: { items: all, totalCount, skip, limit } });
  },
  getMyNfts: async function (req, res, next) {
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 1000;
    const owner = req.body.owner || req.query.owner;
    if (!owner) return res.status(400).json({ error: 'Owner field is required' });
    // const filter = { status: 'minted', $or: [{ owner: owner.toLowerCase() }, { minter: owner.toLowerCase() }] };
    const filter = {  minter: owner.toLowerCase() };
    const totalCount = await Token.find(filter, tokenTemplate).count();
    const all = await Token.find(filter, tokenTemplate).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
    return res.json({ result: { items: all, totalCount, skip, limit } });
  },
  getFilteredNfts: async function (req, res, next) {
    try {
      let { search, page, unit, sortMode, bulkIdList, verifiedOnly, isSales, minter, owner, category, range } =
        req.query;
      const searchQuery = {};
      if (!unit) unit = 20;
      if (unit > 100) unit = 100;

      let sortRule = { createdAt: -1 };
      searchQuery['$match'] = { status: 'minted', isHidden: false };
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
          } else {
            searchQuery['$match']['createdAt'] = { $gt: new Date(new Date() - config.recentTimeDiff) };
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
      if (minter)
        searchQuery['$match'] = { minter: minter.toLowerCase() };
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
        var re = new RegExp(search, 'gi');
        let orOptions = [{ name: re }, { description: re }, { owner: normalizeAddress(re) }];
        if (Number(search) > 0) orOptions.push({ tokenId: Number(search) });
        searchQuery['$match'] = { ...searchQuery['$match'], $or: orOptions };

        // Search through the accounts table
        const accounts = await Account.find({ username: { $regex: new RegExp(search, 'i') } });
        const videos = await getStreamNfts(
          searchQuery['$match'],
          parseInt(unit * page),
          parseInt(unit * page + unit * 1),
          sortRule,
        );
        return res.send({
          result: {
            accounts,
            videos,
          },
        });
      }
      const ret = await getStreamNfts(
        searchQuery['$match'],
        parseInt(unit * page),
        parseInt(unit * page + unit * 1),
        sortRule,
      );
      console.log(ret[0])
      res.send({ result: ret });
    } catch (e) {
      console.log('   ...', new Date(), ' -- index/tokens-search err: ', e);
      res.status(500);
      res.send({ error: e.message });
    }
  },
  getMyWatchedNfts: async function (req, res, next) {
    let watcherAddress = req.query.watcherAddress || req.query.watcherAddress;
    const category = reqParam(req, 'category');
    if (!watcherAddress) return res.status(400).json({ error: 'Watcher address is required' });
    watcherAddress = watcherAddress.toLowerCase();
    const watchedTokenIds = await WatchHistory.find({ watcherAddress }).limit(20).distinct('tokenId');
    if (!watchedTokenIds || watchedTokenIds.length < 1) return res.json({ result: [] });
    const myWatchedNfts = await getStreamNfts(
      { tokenId: { $in: watchedTokenIds }, category: category ? { $elemMatch: { $eq: category } } : null },
      0,
      20,
    );
    myWatchedNfts.map(e => {
      e.imageUrl = process.env.DEFAULT_DOMAIN + '/' + e.imageUrl;
      e.videoUrl = process.env.DEFAULT_DOMAIN + '/' + e.videoUrl;
    });
    return res.json({ result: myWatchedNfts });
  },
  getNftInfo: async function (req, res, next) {
    let tokenId = req.query.id || req.query.id || req.params?.id;
    console.log(req.query)
    if (!tokenId) return res.status(400).json({ error: 'Bad request: No token id' });
    // const nftInfo = await Token.findOne({ tokenId }, tokenTemplate).lean();
    const nftInfo = (await getStreamNfts({ tokenId: Number(tokenId) }, 0, 1))?.[0];
    const userLike = await Vote.findOne({tokenId, address: req.query?.address})
    if (!nftInfo) return res.status(404).json({ error: 'Not Found: NFT does not exist' });
    nftInfo.imageUrl = process.env.DEFAULT_DOMAIN + '/' + nftInfo.imageUrl;
    nftInfo.videoUrl = process.env.DEFAULT_DOMAIN + '/' + nftInfo.videoUrl;
    const comments = await commentsForTokenId(tokenId);
    nftInfo.comments = comments;
    console.log(userLike)
    return res.json({ result: {...nftInfo, isLiked: Boolean(userLike)} });
  },
  getAccountInfo: async function (req, res, next) {
    /// walletAddress param can be username or address
    let walletAddress = req.query.id || req.query.id || req.params?.id;
    if (!walletAddress) return res.status(400).json({ error: 'Bad request: No wallet sent' });
    walletAddress = normalizeAddress(walletAddress);
    let accountInfo = await Account.findOne(
      { $or: [{ address: walletAddress }, { username: walletAddress }] },
      accountTemplate,
    ).lean();
    const balanceData = await Balance.find(
      { address: walletAddress.toLowerCase() },
      { chainId: 1, tokenAddress: 1, walletBalance: 1, staked: 1, _id: 0 },
    );
    if (!balanceData?.length && !accountInfo && !isAddress(walletAddress)) {
      return res.status(404).json({ error: 'Not Found: Account not found', result: false });
    } else if (accountInfo) {
      walletAddress = accountInfo?.address;
    } else {
      accountInfo = {};
    }
    const unlockedPPVStreams = await PPVTransaction.find(
      { address: walletAddress, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } },
      { streamTokenId: 1 },
    ).distinct('streamTokenId');
    accountInfo.balanceData = balanceData.filter(e => e.walletBalance > 0 || e.staked > 0);
    accountInfo.unlocked = unlockedPPVStreams;
    accountInfo.likes = await Feature.find({ address: walletAddress }, {}).distinct('tokenId');
    accountInfo.followings = await getFollowing(walletAddress);
    accountInfo.followers = await getFollowers(walletAddress);
    return res.json({ result: accountInfo });
  },
  getUnlockedNfts: async function (req, res, next) {
    /// walletAddress param can be username or address
    let walletAddress = req.query.id || req.query.id || req.params?.id;
    if (!walletAddress) return res.status(400).json({ error: 'Bad request: No wallet sent' });
    walletAddress = normalizeAddress(walletAddress);
    let accountInfo = {};
    const unlockedPPVStreams = await PPVTransaction.find(
      { address: walletAddress, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } },
      { streamTokenId: 1 },
    ).distinct('streamTokenId');
    accountInfo.unlocked = unlockedPPVStreams;
    return res.json({ result: accountInfo });
  },

  getSignDataForClaim: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    const rawSig = reqParam(req, paramNames.sig);
    const timestamp = reqParam(req, paramNames.timestamp);
    let chainId = reqParam(req, paramNames.chainId);
    const tokenAddress = reqParam(req, paramNames.tokenAddress);
    if (!rawSig || !address || !timestamp || !chainId)
      return res.status(400).json({ error: true, message: 'Signature, Address, Timestamp and chain ID are required' });
    try {
      chainId = parseInt(chainId, 10);
      const result = await signatureForClaim(
        address,
        rawSig,
        timestamp,
        reqParam(req, 'amount'),
        chainId,
        tokenAddress,
      );
      return res.json(result);
    } catch (err) {
      console.log('-----getSignedDataForClaim error', err);
      return res.status(500).json({ result: false, error: 'Claim Failed' });
    }
  },
  updateProfile: async function (req, res, next) {
    let address = reqParam(req, paramNames.address);
    address = normalizeAddress(address);
    const updateAccountOptions = {};
    let username = reqParam(req, userProfileKeys.username);
    Object.entries(editableProfileKeys).forEach(([, profileKey]) => {
      let reqVal = reqParam(req, profileKey);
      if (profileKey === 'customs') {
        try {
          reqVal = JSON.parse(reqVal);
          Object.keys(reqVal).map(key => {
            if (!(Number(key) >= 1 && Number(key) <= 5)) delete reqVal[key];
          });
        } catch {
          console.log('---error updating custom links');
          reqVal = undefined;
        }
      }
      if (reqVal === 'undefined' || reqVal === 'null' || reqVal === '' || !reqVal) reqVal = null;
      // username is not null
      if (!reqVal && profileKey == 'username') return;
      updateAccountOptions[profileKey] = reqVal;
    });
    if (username) {
      username = username.toLowerCase();
      const validation = await isValidUsername(address, username);
      if (validation.error) return res.json(validation);
      updateAccountOptions[userProfileKeys.username] = username;
    }
    const coverImgFile = req.files?.coverImg?.[0];
    const avatarImgFile = req.files?.avatarImg?.[0];
    if (coverImgFile) {
      const imageExt = coverImgFile.originalname.substr(coverImgFile.originalname.toString().indexOf('.') + 1);
      const coverImagePath = `${path.dirname(__dirname)}/assets/covers/${address.toLowerCase()}.${imageExt}`;
      moveFile(coverImgFile.path, coverImagePath);
      updateAccountOptions[userProfileKeys.coverImageUrl] = `statics/covers/${address.toLowerCase()}.${imageExt}`;
    }
    if (avatarImgFile) {
      const avatarImageExt = avatarImgFile.originalname.substr(avatarImgFile.originalname.toString().indexOf('.') + 1);
      const avatarImagePath = `${path.dirname(__dirname)}/assets/avatars/${address.toLowerCase()}.${avatarImageExt}`;
      moveFile(avatarImgFile.path, avatarImagePath);
      updateAccountOptions[
        userProfileKeys.avatarImageUrl
      ] = `statics/avatars/${address.toLowerCase()}.${avatarImageExt}`;
    }
    const updatedAccount = await Account.findOneAndUpdate(
      { address: address.toLowerCase() },
      updateAccountOptions,
      overrideOptions,
    );
    if (updatedAccount.displayName && !updatedAccount.username) {
      // set default username
      username = updatedAccount.displayName.toLowerCase().replace(' ', '_');
      let tailNumber = 0;
      for (let i = 0; i < 10000; i++) {
        const updatedUsername = tailNumber === 0 ? username : `${username}_${tailNumber}`;
        const validation = await isValidUsername(address, updatedUsername);
        if (validation.result) {
          await Account.updateOne({ address }, { username: updatedUsername });
          break;
        } else {
          tailNumber++;
        }
      }
    }
    let result = { result: true };
    return res.json(result);
  },
  requestPPVStream: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    const rawSig = reqParam(req, paramNames.sig);
    const timestamp = reqParam(req, paramNames.timestamp);
    let chainId = reqParam(req, paramNames.chainId);
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!rawSig || !address || !timestamp || !chainId)
      return res.status(400).json({ error: true, message: 'Signature, Address, Timestamp and chain ID are required' });
    try {
      chainId = parseInt(chainId, 10);
      streamTokenId = parseInt(streamTokenId, 10);
      const result = await requestPPVStream(address, rawSig, timestamp, chainId, streamTokenId);
      return res.json(result);
    } catch (err) {
      console.log('-----request ppv error', err);
      return res.status(500).json({ result: false, error: 'Request for PPV stream failed' });
    }
  },
  requestLike: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      streamTokenId = parseInt(streamTokenId, 10);
      const result = await requestLike(address, streamTokenId);
      return res.json(result);
    } catch (err) {
      console.log('-----request like error', err);
      return res.status(500).json({ result: false, error: 'Like request failed' });
    }
  },
  leaderboard: async function (req, res, next) {
    const sort = reqParam(req, 'sort');
    return res.json(await getLeaderboard(sort));
  },
  requestTip: async function (req, res, next) {
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
      const owner = await Token.findOne({ tokenId: streamTokenId }, {}).lean();
      const result = await requestTip(address, streamTokenId, amount, chainId);
      await notificationService.createNotification(normalizeAddress(owner.owner), 'tip', {
        senderAddress: normalizeAddress(address),
        tipAmount: amount,
      });
      return res.json(result);
    } catch (err) {
      console.log('-----request tip error', err);
      return res.status(500).json({ result: false, error: 'Tip failed' });
    }
  },
  requestComment: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    let content = reqParam(req, 'content');
    let commentId = reqParam(req, 'commentId');
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      if (!content) return res.status(400).json({ error: true, message: 'Comment content is required' });
      streamTokenId = parseInt(streamTokenId, 10);
      commentId = commentId ? parseInt(commentId, 10) : undefined;
      const owner = await Token.findOne({ tokenId: streamTokenId }, {}).lean();
      const result = await requestComment(address, streamTokenId, content, commentId);
      // notify owner
      await notificationService.createNotification(normalizeAddress(owner.owner), 'comment', {
        tokenId: streamTokenId,
        senderAddress: normalizeAddress(address),
      });
      return res.json(result);
    } catch (err) {
      console.log('-----request comment error', err);
      return res.status(500).json({ result: false, error: 'Comment failed' });
    }
  },
  requestVote: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    const vote = reqParam(req, 'vote'); // 'true' => yes or 'false' => no
    let streamTokenId = reqParam(req, paramNames.streamTokenId);
    if (!streamTokenId) return res.status(404).json({ error: true, message: 'Not Found: Token does not exist' });
    try {
      if (!vote) return res.status(400).json({ error: true, message: 'Vote params is required' });
      streamTokenId = parseInt(streamTokenId, 10);
      const owner = await Token.findOne({ tokenId: streamTokenId }, {}).lean();
      const result = await requestVote(address, streamTokenId, vote.toString());
      // notify owner
      await notificationService.createNotification(
        normalizeAddress(owner.owner),
        vote === 'true' ? 'like' : 'dislike',
        {
          tokenId: streamTokenId,
          senderAddress: normalizeAddress(address),
        },
      );
      // Add to liked videos
      if (vote === 'true') {
        await likedVideoService.createLikedVideo(normalizeAddress(address), owner._id);
      }
      return res.json(result);
    } catch (err) {
      console.log('-----request vote error', err);
      return res.status(500).json({ result: false, error: 'Voting failed' });
    }
  },
  requestFollow: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    const following = reqParam(req, 'following');
    const unFollowing = reqParam(req, 'unFollowing');
    if (!following && !isAddress(following))
      return res.status(400).json({ error: true, message: 'Following params is required' });
    try {
      let result = undefined;
      if (unFollowing != 'true') {
        result = await requestFollow(address, following);
        await notificationService.createNotification(normalizeAddress(following), 'following', {
          senderAddress: normalizeAddress(address),
        });
      } else result = await unFollow(address, following);
      return res.json(result);
    } catch (err) {
      console.log('-----request follow error', err);
      return res.status(500).json({ result: false, error: 'Following failed' });
    }
  },
  getSignForClaimBounty: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    const tokenId = reqParam(req, 'tokenId');
    if (!address || !tokenId)
      return res.status(400).json({ result: false, error: 'Address and token ID are required' });
    const eligibleResult = await eligibleBountyForAccount(address, tokenId);
    const result = { error: false, result: {}, claimed: {} };
    if (eligibleResult?.viewer_claimed) result.result.viewer_claimed = true;
    if (eligibleResult?.commentor_claimed) result.result.commentor_claimed = true;

    if (eligibleResult.viewer) {
      const sigResult = await signatureForClaimBounty(address, tokenId, 0);
      result.result.viewer = sigResult;
    }
    if (eligibleResult.commentor) {
      const sigResult = await signatureForClaimBounty(address, tokenId, 1);
      result.result.commentor = sigResult;
    }
    if (result.result.viewer || result.result.commentor) return res.json(result);
    else {
      result.error = 'Not Eligible';
      return res.json(result);
    }
  },
  addCategory: async function (req, res, next) {
    const name = reqParam(req, 'name');
    try {
      const result = await Category.updateOne({ name }, { name }, overrideOptions);
      if (result.upserted) return res.json({ result: true });
      else return res.status(409).json({ result: false, error: 'Already exists' });
    } catch (err) {
      console.log('-----add category error', err);
      return res.status(500).json({ result: false, error: 'Could not add Category' });
    }
  },
  getCategories: async function (req, res, next) {
    try {
      let result = await Category.find({}, { _id: 0, name: 1 }).distinct('name');
      return res.json(result);
    } catch (err) {
      console.log('-----request follow error', err);
      return res.status(500).json({ result: false, error: 'Could not fetch catergories' });
    }
  },
  getUsernames: async function (req, res, next) {
    try {
      let result = await Account.find({}, { username: 1 }).distinct('username');
      return res.json(result);
    } catch (err) {
      console.log('-----request getUsernames error', err);
      return res.status(500).json({ result: false, error: 'Failed to fetch username' });
    }
  },
  isValidUsername: async function (req, res, next) {
    const username = reqParam(req, userProfileKeys.username);
    const address = reqParam(req, 'address');
    try {
      return res.json(await isValidUsername(normalizeAddress(address), normalizeAddress(username)));
    } catch (err) {
      console.log('-----validate username error', err);
      return res.status(500).json({ result: false, error: 'Could not validate username' });
    }
  },
  getNumberOfUsers: async function (req, res, next) {
    try {
      const userCount = await Account.countDocuments({});
      return res.json({ result: userCount });
    } catch (error) {
      console.error('Error getting user count:', error.message);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },
  publicAccountData: async function (req, res, next) {
    const addressList = reqParam(req, 'addressList');
    if (!addressList || addressList.length < 1)
      return res.status(400).json({ result: false, error: 'Bad Request: Address List is required' });
    try {
      const accountTemplate = {
        _id: 0,
        address: 1,
        username: 1,
        displayName: 1,
        avatarImageUrl: 1,
      };
      return res.json({ result: await Account.find({ address: { $in: addressList } }, accountTemplate) });
    } catch (err) {
      console.log('-----public account data', err);
      return res.status(500).json({ result: false, error: error.message || 'Could not fetch account data' });
    }
  },
  requestReaction: async function (req, res, next) {
    const address = reqParam(req, paramNames.address);
    const reactionType = reqParam(req, 'reactionType');
    const subjectType = reqParam(req, 'subjectType');
    const subjectId = reqParam(req, 'subjectId');
    if (!subjectId || !reactionType || !subjectType)
      return res
        .status(400)
        .json({ error: true, message: 'address, reactionType, subjectType and subjectId are required' });
    try {
      const result = await requestReaction({ address, subjectId, reactionType, subjectType });
      return res.json(result);
    } catch (err) {
      console.log('-----request reaction error', err);
      return res.status(500).json({ result: false, error: error.message || 'Reaction failed' });
    }
  },
  getReactions: async function (req, res, next) {
    const subjectType = reqParam(req, 'subjectType');
    const skip = req.body.skip || req.query.skip || 0;
    const limit = req.body.limit || req.query.limit || 200;
    const result = await Reaction.find({ subjectType }, { subjectId: 1, value: 1, type: 1, _id: 0 })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return res.json({ result });
  },
};
module.exports = { ApiController };
