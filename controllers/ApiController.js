const { Account } = require('../models/Account');
const path = require("path");
require("dotenv").config();
const { ethers } = require('ethers');
const { isValidAccount, reqParam } = require('../utils/auth');
const { decryptWithSourceKey, encryptWithSourceKey } = require('../utils/encrypt');
const { paramNames, errorMsgs, userProfileKeys, overrideOptions, tokenTemplate, editableProfileKeys } = require('../config/constants');
const { Token } = require('../models/Token');
const { checkFileType, normalizeAddress } = require('../utils/format');
const { signatureForMintingNFT } = require('./mintNft');
const { removeDuplicatedObject, isValidTipAmount, eligibleBountyForAccount, isValidUsername, isValidSearch } = require('../utils/validation');
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

const expireTime = 86400000;

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
    createdAt: 1,
    sentTips: 1,
    receivedTips: 1,
    uploads: 1,
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
            const account = await Account.findOneAndUpdate({ address }, { lastLoginTimestamp: Date.now() }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (!account) return res.json({ status: false, error: true, error_msg: "not found account" });
            return res.json({ status: true, result: { address: signedAddress, lastLoginTimestamp: account.lastLoginTimestamp } });
        } catch (e) {
            return res.json({ error: true, msg: "sign error" });
        }
    },
    getSignedDataForUserMint: async function (req, res, next) {
        const { address, name, description, streamInfo, chainId, category } = req.body;
        console.log('upload:', name, description, streamInfo, chainId, JSON.parse(category));
        const uploadedFiles = req.files.files;
        if (uploadedFiles?.length < 2) return res.json({ error: true, msg: "upload image and video file" });
        const videoFile = uploadedFiles[0];
        if (!checkFileType(videoFile)) return res.json({ error: true, msg: errorMsgs.not_supported_video });
        const imageFile = uploadedFiles[1];
        if (!checkFileType(imageFile, 'image')) return res.json({ error: true, msg: errorMsgs.not_supported_image });
        try {
            const result = await signatureForMintingNFT(videoFile, imageFile, name, description, JSON.parse(streamInfo), address, Number(chainId), JSON.parse(category));
            return res.json(result);
        }
        catch (err) {
            console.log('-----getSignedDataForUserMint error', err);
            return res.json({ result: false, error: 'Uploading was failed' });
        }
    },
    getAllNfts: async function (req, res, next) {
        const skip = req.body.skip || req.query.skip || 0;
        const limit = req.body.limit || req.query.limit || 1000;
        const filter = { status: "minted" };
        const totalCount = await Token.find(filter, tokenTemplate).count();
        const all = await getStreamNfts(filter, skip, limit);
        return res.json({ result: { items: all, totalCount, skip, limit } });
    },
    getMyNfts: async function (req, res, next) {
        const skip = req.body.skip || req.query.skip || 0;
        const limit = req.body.limit || req.query.limit || 1000;
        const owner = req.body.owner || req.query.owner;
        if (!owner) return res.json({ error: 'no owner field!' });
        // const filter = { status: 'minted', $or: [{ owner: owner.toLowerCase() }, { minter: owner.toLowerCase() }] };
        const filter = { status: 'minted', minter: owner.toLowerCase() };
        const totalCount = await Token.find(filter, tokenTemplate).count();
        const all = await Token.find(filter, tokenTemplate)
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        return res.json({ result: { items: all, totalCount, skip, limit } });
    },
    getFilteredNfts: async function (req, res, next) {
        try {
            let { search, page, unit, sortMode, bulkIdList, verifiedOnly, isSales, minter, owner, category } = req.query;
            const searchQuery = {};
            if (!unit) unit = 20;
            if (unit > 100) unit = 100;

            let sortRule = { createdAt: -1 };
            searchQuery['$match'] = { status: 'minted' };
            switch (sortMode) {
                case 'trends':
                    sortRule = { views: -1 };
                    break;
                case 'new':
                    searchQuery['$match']['createdAt'] = { $gt: new Date(new Date() - config.recentTimeDiff) };
                    break;
                case 'mostLiked':
                    sortRule = { likes: -1 };
                    break;
            }

            if (!page) page = 0;
            if (minter) searchQuery['$match'] = { minter: minter.toLowerCase(), $or: [{ status: 'minted' }, { status: 'pending' }] };
            if (owner) searchQuery['$match'] = { owner: owner.toLowerCase() };
            if (category) {
                searchQuery['$match']['category'] = { $elemMatch: { $eq: category } }
            }
            if (search) {
                if (!isValidSearch(search)) return res.json({ result: [] });
                var re = new RegExp(search, "gi")
                searchQuery['$match'] = { ...searchQuery['$match'], $or: [{ name: re }, { description: re }, { minter: re }, { owner: re }] }
            }
            if (bulkIdList) {
                let idList = bulkIdList.split("-");
                if (idList.length > 0) {
                    idList = idList.map(e => "0x" + e);
                    searchQuery['$match'] = { id: { $in: idList } }
                }
            }

            if ((verifiedOnly + '').toLowerCase() === 'true' || verifiedOnly === '1') {
                searchQuery['$match'] = { ...searchQuery['$match'], verified: true };
            }

            const ret = await getStreamNfts(searchQuery['$match'], parseInt(unit * page), parseInt(unit * page + unit * 1), sortRule);
            res.send({ result: ret });
        } catch (e) {
            console.log('   ...', new Date(), ' -- index/tokens-search err: ', e);
            res.status(500)
            res.send({ error: e.message })
        }
    },
    getMyWatchedNfts: async function (req, res, next) {
        let watcherAddress = req.query.watcherAddress || req.query.watcherAddress;
        const category = reqParam(req, 'category');
        if (!watcherAddress) return res.json({ error: 'not define watcherAddress' });
        watcherAddress = watcherAddress.toLowerCase();
        const watchedTokenIds = await WatchHistory.find({ watcherAddress }).limit(20).distinct('tokenId');
        if (!watchedTokenIds || watchedTokenIds.length < 1) return res.json({ result: [] });
        const myWatchedNfts = await getStreamNfts({ tokenId: { $in: watchedTokenIds }, category: category ? { $elemMatch: { $eq: category } } : null }, 0, 20);
        myWatchedNfts.map(e => {
            e.imageUrl = process.env.DEFAULT_DOMAIN + "/" + e.imageUrl;
            e.videoUrl = process.env.DEFAULT_DOMAIN + "/" + e.videoUrl;
        });
        return res.json({ result: myWatchedNfts });
    },
    getNftInfo: async function (req, res, next) {
        let tokenId = req.query.id || req.query.id || req.params?.id;
        if (!tokenId) return res.json({ error: 'not define tokenId' });
        // const nftInfo = await Token.findOne({ tokenId }, tokenTemplate).lean();
        const nftInfo = (await getStreamNfts({ tokenId: Number(tokenId) }, 0, 1))?.[0];
        if (!nftInfo) return res.json({ error: 'no nft' });
        nftInfo.imageUrl = process.env.DEFAULT_DOMAIN + "/" + nftInfo.imageUrl;
        nftInfo.videoUrl = process.env.DEFAULT_DOMAIN + "/" + nftInfo.videoUrl;
        const comments = await commentsForTokenId(tokenId);
        nftInfo.comments = comments;
        return res.json({ result: nftInfo });
    },
    getAccountInfo: async function (req, res, next) {
        /// walletAddress param can be username or address
        let walletAddress = req.query.id || req.query.id || req.params?.id;
        if (!walletAddress) return res.json({ error: 'not define wallet' });
        walletAddress = normalizeAddress(walletAddress);
        let accountInfo = await Account.findOne({ $or: [{ address: walletAddress }, { username: walletAddress }] }, accountTemplate).lean();
        const balanceData = await Balance.find({ address: walletAddress.toLowerCase() }, { chainId: 1, tokenAddress: 1, walletBalance: 1, staked: 1, _id: 0 });
        if (!balanceData?.length && !accountInfo && !isAddress(walletAddress)) {
            return res.json({ error: 'no account', result: false });
        } else if (accountInfo) {
            walletAddress = accountInfo?.address;
        } else {
            accountInfo = {};
        }
        const unlockedPPVStreams = await PPVTransaction.find({ address: walletAddress, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } }, { streamTokenId: 1 }).distinct('streamTokenId');
        accountInfo.balanceData = balanceData.filter(e => e.walletBalance > 0 || e.staked > 0);
        accountInfo.unlocked = unlockedPPVStreams;
        accountInfo.likes = await Feature.find({ address: walletAddress }, {}).distinct('tokenId');
        accountInfo.followings = await getFollowing(walletAddress);
        accountInfo.followers = await getFollowers(walletAddress);
        return res.json({ result: accountInfo, });
    },
    getSignDataForClaim: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const rawSig = reqParam(req, paramNames.sig);
        const timestamp = reqParam(req, paramNames.timestamp);
        let chainId = reqParam(req, paramNames.chainId);
        const tokenAddress = reqParam(req, paramNames.tokenAddress);
        if (!rawSig || !address || !timestamp || !chainId)
            return res.json({ error: true, msg: "sig or address not exist" });
        try {
            chainId = parseInt(chainId, 10);
            const result = await signatureForClaim(address, rawSig, timestamp, reqParam(req, 'amount'), chainId, tokenAddress);
            return res.json(result);
        }
        catch (err) {
            console.log('-----getSignedDataForClaim error', err);
            return res.json({ result: false, error: 'claim was failed' });
        }
    },
    updateProfile: async function (req, res, next) {
        let address = reqParam(req, paramNames.address);
        address = normalizeAddress(address);
        const updateAccountOptions = {};
        let username = reqParam(req, userProfileKeys.username);
        Object.entries(editableProfileKeys).forEach(([, profileKey]) => {
            const reqVal = reqParam(req, profileKey);
            if (reqVal && reqVal !== 'undefined' && reqVal !== 'null') updateAccountOptions[profileKey] = reqVal;
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
            const imageExt = coverImgFile.mimetype.toString().substr(coverImgFile.mimetype.toString().indexOf("/") + 1);
            const coverImagePath = `${path.dirname(__dirname)}/assets/covers/${address.toLowerCase()}.${imageExt}`;
            moveFile(coverImgFile.path, coverImagePath);
            updateAccountOptions[userProfileKeys.coverImageUrl] = `statics/covers/${address.toLowerCase()}.${imageExt}`;
        }
        if (avatarImgFile) {
            const avatarImageExt = avatarImgFile.mimetype.toString().substr(avatarImgFile.mimetype.toString().indexOf("/") + 1);
            const avatarImagePath = `${path.dirname(__dirname)}/assets/avatars/${address.toLowerCase()}.${avatarImageExt}`;
            moveFile(avatarImgFile.path, avatarImagePath);
            updateAccountOptions[userProfileKeys.avatarImageUrl] = `statics/avatars/${address.toLowerCase()}.${avatarImageExt}`;
        }
        const updatedAccount = await Account.findOneAndUpdate({ address: address.toLowerCase() }, updateAccountOptions, overrideOptions);
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
                }
                else {
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
            return res.json({ error: true, msg: "sig or address not exist" });
        try {
            chainId = parseInt(chainId, 10);
            streamTokenId = parseInt(streamTokenId, 10);
            const result = await requestPPVStream(address, rawSig, timestamp, chainId, streamTokenId);
            return res.json(result);
        }
        catch (err) {
            console.log('-----request ppv error', err);
            return res.json({ result: false, error: 'request ppv stream was failed' });
        }
    },
    requestLike: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        let streamTokenId = reqParam(req, paramNames.streamTokenId);
        if (!streamTokenId)
            return res.json({ error: true, msg: "tokenId does not exist" });
        try {
            streamTokenId = parseInt(streamTokenId, 10);
            const result = await requestLike(address, streamTokenId);
            return res.json(result);
        }
        catch (err) {
            console.log('-----request like error', err);
            return res.json({ result: false, error: 'request ppv stream was failed' });
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
        if (!streamTokenId)
            return res.json({ error: true, msg: "streamTokenId not exist" });
        try {
            amount = Number(amount);
            chainId = parseInt(chainId, 10);
            if (!isValidTipAmount(amount)) return res.json({ error: true, msg: "Invalid tip amount!" });
            streamTokenId = parseInt(streamTokenId, 10);
            const result = await requestTip(address, streamTokenId, amount, chainId);
            return res.json(result);
        }
        catch (err) {
            console.log('-----request like error', err);
            return res.json({ result: false, error: 'request ppv stream was failed' });
        }
    },
    requestComment: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        let content = reqParam(req, 'content');
        let commentId = reqParam(req, 'commentId');
        let streamTokenId = reqParam(req, paramNames.streamTokenId);
        if (!streamTokenId)
            return res.json({ error: true, msg: "streamTokenId not exist" });
        try {
            if (!content) return res.json({ error: true, msg: "no comment!" });
            streamTokenId = parseInt(streamTokenId, 10);
            commentId = commentId ? parseInt(commentId, 10) : undefined;
            const result = await requestComment(address, streamTokenId, content, commentId);
            return res.json(result);
        }
        catch (err) {
            console.log('-----request comment error', err);
            return res.json({ result: false, error: 'comment was failed' });
        }
    },
    requestVote: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const vote = reqParam(req, 'vote'); // 'true' => yes or 'false' => no
        let streamTokenId = reqParam(req, paramNames.streamTokenId);
        if (!streamTokenId)
            return res.json({ error: true, msg: "streamTokenId not exist" });
        try {
            if (!vote) return res.json({ error: true, msg: "no vote!" });
            streamTokenId = parseInt(streamTokenId, 10);
            const result = await requestVote(address, streamTokenId, vote.toString());
            return res.json(result);
        }
        catch (err) {
            console.log('-----request vote error', err);
            return res.json({ result: false, error: 'voting was failed' });
        }
    },
    requestFollow: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const following = reqParam(req, 'following');
        const unFollowing = reqParam(req, 'unFollowing');
        if (!following && !isAddress(following))
            return res.json({ error: true, msg: "following param is missing" });
        try {
            let result = undefined;
            if (unFollowing != 'true') result = await requestFollow(address, following);
            else result = await unFollow(address, following);
            return res.json(result);
        }
        catch (err) {
            console.log('-----request follow error', err);
            return res.json({ result: false, error: 'following was failed' });
        }
    },
    getSignForClaimBounty: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const tokenId = reqParam(req, 'tokenId');
        if (!address || !tokenId) return res.json({ result: false, error: 'not params' });
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
            result.error = 'not eligible';
            return res.json(result);
        }
    },
    addCategory: async function (req, res, next) {
        const name = reqParam(req, 'name');
        try {
            const result = await Category.updateOne({ name }, { name }, overrideOptions);
            if (result.upserted) return res.json({ result: true });
            else return res.json({ result: false, error: 'Already exists the category' });
        }
        catch (err) {
            console.log('-----add category error', err);
            return res.json({ result: false, error: 'adding category was failed' });
        }
    },
    getCategories: async function (req, res, next) {
        try {
            let result = await Category.find({}, { _id: 0, name: 1 }).distinct('name');
            return res.json(result);
        }
        catch (err) {
            console.log('-----request follow error', err);
            return res.json({ result: false, error: 'following was failed' });
        }
    },
    getUsernames: async function (req, res, next) {
        try {
            let result = await Account.find({}, { username: 1 }).distinct('username');
            return res.json(result);
        }
        catch (err) {
            console.log('-----request follow error', err);
            return res.json({ result: false, error: 'following was failed' });
        }
    },
    isValidUsername: async function (req, res, next) {
        const username = reqParam(req, userProfileKeys.username);
        const address = reqParam(req, 'address');
        try {
            return res.json(await isValidUsername(normalizeAddress(address), normalizeAddress(username)));
        }
        catch (err) {
            console.log('-----request follow error', err);
            return res.json({ result: false, error: 'following was failed' });
        }
    },
    publicAccountData: async function (req, res, next) {
        const addressList = reqParam(req, 'addressList');
        if (!addressList || addressList.length < 1) return res.json({ result: false, error: 'no addressList' });
        try {
            const accountTemplate = {
                _id: 0,
                address: 1,
                username: 1,
                displayName: 1,
                avatarImageUrl: 1,
            }
            return res.json({ result: await Account.find({ address: { $in: addressList } }, accountTemplate) });
        }
        catch (err) {
            console.log('-----request follow error', err);
            return res.json({ result: false, error: 'following was failed' });
        }
    },
}
module.exports = { ApiController };