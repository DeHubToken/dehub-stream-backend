const { Account } = require('../models/Account');
const path = require("path");
const fs = require('fs');
require("dotenv").config();
const { ethers, FixedNumber } = require('ethers');
const { splitSignature } = require('@ethersproject/bytes');
const { isValidAccount, reqParam } = require('../utils/auth');
const { decryptWithSourceKey, encryptWithSourceKey } = require('../utils/encrypt');
const { paramNames, errorMsgs, userProfileKeys, overrideOptions } = require('../config/constants');
const { Token } = require('../models/Token');
const { checkFileType } = require('../utils/format');
const { signatureForMintingNFT } = require('./mintNft');
const { removeDuplicatedObject } = require('../utils/validation');
const { WatchHistory } = require('../models/WatchHistory');
const { config } = require('../config');
const { signatureForClaim } = require('./user');
const { result } = require('underscore');
const { moveFile } = require('../utils/file');
const expireTime = 86400000;
const tokenTemplate = {
    name: 1,
    description: 1,
    tokenId: 1,
    imageUrl: 1,
    videoUrl: 1,
    owner: 1,
    minter: 1,
    streamInfo: 1,
    videoDuration: 1,
    videoExt: 1,
    views: 1,
    _id: 0,
};
const accountTemplate = {
    username: 1,
    balance: 1,
    depositedBalance: 1,
    [userProfileKeys.avatarImageUrl]: 1,
    [userProfileKeys.coverImageUrl]: 1,
    [userProfileKeys.username]: 1,
    [userProfileKeys.aboutMe]: 1,
    [userProfileKeys.email]: 1,
    [userProfileKeys.facebookLink]: 1,
    [userProfileKeys.twitterLink]:1,
    [userProfileKeys.discordLink]: 1,
    [userProfileKeys.instagramLink]: 1,
    createdAt: 1,
    _id: 0,
};
const ApiController = {
    getServerTime: async function (req, res, next) {
        return res.json({ status: true, data: Math.floor(Date.now() / 1000), note: 's' });
    },
    signWithWallet: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const rawSig = reqParam(req, paramNames.sig);
        const timestamp = reqParam(req, paramNames.timestamp);
        if (!rawSig || !address || !timestamp)
            return res.json({ error: true, msg: "sig or address not exist" });
        const signedMsg = `${address.toLowerCase()}-${timestamp}`;
        console.log("---signed msg", signedMsg, rawSig);
        // const toSign = ethers.utils
        //     .keccak256(
        //         ethers.utils.defaultAbiCoder.encode(["string"], [signedMsg])
        //     )
        //     .slice(2);
        try {
            const signedAddress = ethers.utils
                .verifyMessage(signedMsg, rawSig)
                .toLowerCase();
            console.log("---user sign", signedAddress);
            if (signedAddress != address) return res.json({ status: false, error: true, error_msg: "sign error" });
            const account = await Account.findOneAndUpdate({ address: signedAddress }, { loginDate: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (!account) return res.json({ status: false, error: true, error_msg: "not found account" });
            console.log(account);
            return res.json({ status: true, result: { address: signedAddress, loginDate: account.loginDate } });
        } catch (e) {
            console.log("signature error", e);
            return res.json({ error: true, msg: "sign error" });
        }
    },
    registerUserInfo: async function (req, res, next) {
        const address = req.query.address || req.body.address || req.params.address;
        const rawSig = req.query.sig || req.body.sig || req.params.sig;
        const timestamp = req.query.timestamp || req.body.timestamp || req.params.timestamp;
        const data = reqParam(req, "data");
        const encryptedUsername = reqParam(req, "data1");
        const encryptedEmail = reqParam(req, "data2");
        // const username = req.query.username || req.body.username || req.params.username;        
        if (!rawSig || !address || !timestamp || !encryptedUsername || !encryptedEmail)
            return res.json({ error: true, msg: "sig or address not exist" });
        if (Number(timestamp) < Date.now() - expireTime)
            return res.json({ error: true, msg: "expired!" });
        let signedMsg = `${address.toLowerCase()}-${timestamp}`;
        console.log("---signed msg", signedMsg, rawSig);
        try {
            // signedMsg = ethers.utils
            // .keccak256(
            //   ethers.utils.defaultAbiCoder.encode(["string"], [signedMsg])
            // )
            // .slice(2);
            const signedAddress = ethers.utils
                .verifyMessage(signedMsg, rawSig)
                .toLowerCase();
            console.log("---user sign", signedAddress);
            if (signedAddress.toLowerCase() != address.toLowerCase()) return res.json({ status: false, error: true, error_msg: "sign error" });
            const username = decryptWithSourceKey(encryptedUsername, rawSig);
            const email = decryptWithSourceKey(encryptedEmail, rawSig);

            // let decryptedData;
            if (!username || !email)
                return res.json({ error: true, msg: "username or email not exist" });
            // try {
            //     decryptedData = JSON.parse(decrypted);
            // }
            // catch
            // {
            //     return res.json({ error: true, msg: "sig or address not exist" });
            // }

            const account = await Account.findOneAndUpdate({ address: signedAddress }, { username, email, loginDate: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (!account) return res.json({ status: false, error: true, error_msg: "not found account" });
            console.log(account);
            return res.json({ status: true, result: { address: signedAddress, loginDate: account.loginDate } });
        } catch (e) {
            console.log("signature error", e);
            return res.json({ error: true, msg: "sign error" });
        }
    },
    getUserInfo: async function (req, res, next) {
        const address = reqParam(req, "address");
        const rawSig = reqParam(req, "sig");
        const timestamp = reqParam(req, "timestamp");

        if (!rawSig || !address || !timestamp)
            return res.json({ error: true, msg: "sig or parameters not exist" });
        if (Number(timestamp) < Date.now() - expireTime)
            return res.json({ error: true, msg: "expired!" });
        const result = await isValidAccount(address, timestamp, rawSig);
        if (!result) return res.json({ status: false, error: true, error_msg: "should login first" });
        const data = { u: result.username, e: result.email };
        // const encrypted = encryptWithSourceKey(JSON.stringify(data), rawSig);
        const data1 = encryptWithSourceKey(result.username, rawSig);
        const data2 = encryptWithSourceKey(result.email, rawSig);
        return res.json({ status: true, result: { data1, data2 } });
    },
    getSignedDataForUserMint: async function (req, res, next) {
        const { from, name, description, streamInfo } = req.body;
        console.log(name, description, streamInfo);
        const uploadedFiles = req.files.files;
        if (uploadedFiles?.length < 2) return res.json({ error: true, msg: "upload image and video file" });
        const videoFile = uploadedFiles[0];
        if (!checkFileType(videoFile)) return res.json({ error: true, msg: errorMsgs.not_supported_video });
        const imageFile = uploadedFiles[1];
        if (!checkFileType(imageFile, 'image')) return res.json({ error: true, msg: errorMsgs.not_supported_image });
        try {
            const result = await signatureForMintingNFT(videoFile, imageFile, name, description, JSON.parse(streamInfo));
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
        const all = await Token.find(filter, tokenTemplate)
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        return res.json({ result: { items: all, totalCount, skip, limit } });
    },
    getMyNfts: async function (req, res, next) {
        const skip = req.body.skip || req.query.skip || 0;
        const limit = req.body.limit || req.query.limit || 1000;
        const owner = req.body.owner || req.query.owner;
        if (!owner) return res.json({ error: 'no owner field!' });
        const filter = { status: 'minted', $or: [{ owner: owner.toLowerCase() }, { minter: owner.toLowerCase() }] };

        const tokenTemplate = {
            name: 1,
            description: 1,
            tokenId: 1,
            imageUrl: 1,
            videoUrl: 1,
            owner: 1,
            minter: 1,
            streamInfo: 1,
            videoDuration: 1,
            _id: 0,
        };
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
            let { search, page, unit, sortMode, bulkIdList, verifiedOnly, isSales, minter } = req.query
            const searchQuery = {};
            if (!unit) unit = 20;
            if (unit > 100) unit = 100;

            let sortRule = { createdAt: -1 };
            searchQuery['$match'] = {};
            switch (sortMode) {
                case 'trends':
                    sortRule = { views: -1 };
                    break;
                case 'new':
                    searchQuery['$match'] = { createdAt: { $gt: new Date(new Date() - config.recentTimeDiff) } }
                    break;
                case 'mostLiked':
                    sortRule = { likes: -1 };
                    break;
            }

            if (!page) page = 0;
            let aggregateQuery = []
            if (minter) searchQuery['$match'] = { minter: minter.toLowerCase() };
            if (search) {
                var re = new RegExp(search, "gi")
                searchQuery['$match'] = { ...searchQuery['$match'], $or: [{ name: re }, { description: re }, { minter: re }, { owner: re }] }
                aggregateQuery = [searchQuery]
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
            // searchQuery["$sort"] = sortRule;
            aggregateQuery = [searchQuery];
            aggregateQuery = !searchQuery['$match'] ? [{ $sort: sortRule }] : [...aggregateQuery, { $sort: sortRule }];
            if (unit) aggregateQuery = [...aggregateQuery, { $limit: parseInt(unit * page + unit * 1) }];
            if (page) aggregateQuery = [...aggregateQuery, { $skip: parseInt(unit * page) }];
            aggregateQuery.push({ $project: tokenTemplate });
            let filteredNfts = await Token.aggregate(aggregateQuery);
            const tmpResult = filteredNfts;
            const ret = removeDuplicatedObject(tmpResult, 'tokenId');
            ret.map(e => {
                e.imageUrl = process.env.DEFAULT_DOMAIN + "/" + e.imageUrl;
                e.videoUrl = process.env.DEFAULT_DOMAIN + "/" + e.videoUrl;
                delete e.duplicatedCnt;
            });
            res.send({ result: ret });
        } catch (e) {
            console.log('   ...', new Date(), ' -- index/tokens-search err: ', e);
            res.status(500)
            res.send({ error: e.message })
        }
    },
    getMyWatchedNfts: async function (req, res, next) {
        let watcherAddress = req.query.watcherAddress || req.query.watcherAddress;
        if (!watcherAddress) return res.json({ error: 'not define watcherAddress' });
        watcherAddress = watcherAddress.toLowerCase();
        const watchedTokenIds = await WatchHistory.find({ watcherAddress }).limit(20).distinct('tokenId');
        if (!watchedTokenIds || watchedTokenIds.length < 1) return res.json({ result: [] });
        const myWatchedNfts = await Token.find({ tokenId: { $in: watchedTokenIds } }, tokenTemplate);
        myWatchedNfts.map(e => {
            e.imageUrl = process.env.DEFAULT_DOMAIN + "/" + e.imageUrl;
            e.videoUrl = process.env.DEFAULT_DOMAIN + "/" + e.videoUrl;
        });
        return res.json({ result: myWatchedNfts });
    },
    getNftInfo: async function (req, res, next) {
        let tokenId = req.query.id || req.query.id || req.params?.id;
        if (!tokenId) return res.json({ error: 'not define tokenId' });
        const nftInfo = await Token.findOne({ tokenId }, tokenTemplate).lean();
        if (!nftInfo) return res.json({ error: 'no nft' });
        nftInfo.imageUrl = process.env.DEFAULT_DOMAIN + "/" + nftInfo.imageUrl;
        nftInfo.videoUrl = process.env.DEFAULT_DOMAIN + "/" + nftInfo.videoUrl;
        return res.json({ result: nftInfo });
    },
    getAccountInfo: async function (req, res, next) {
        let walletAddress = req.query.id || req.query.id || req.params?.id;
        if (!walletAddress) return res.json({ error: 'not define wallet' });
        const accountInfo = await Account.findOne({ address: walletAddress.toLowerCase() }, accountTemplate).lean();
        if (!accountInfo) return res.json({ error: 'no account' });
        if (accountInfo.avatarImageUrl) accountInfo.avatarImageUrl = `${process.env.DEFAULT_DOMAIN}/${accountInfo.avatarImageUrl}`;
        if (accountInfo.coverImageUrl) accountInfo.coverImageUrl = `${process.env.DEFAULT_DOMAIN}/${accountInfo.coverImageUrl}`;
        return res.json({ result: accountInfo });
    },
    getSignDataForClaim: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const rawSig = reqParam(req, paramNames.sig);
        const timestamp = reqParam(req, paramNames.timestamp);
        if (!rawSig || !address || !timestamp)
            return res.json({ error: true, msg: "sig or address not exist" });
        try {
            const result = await signatureForClaim(address, rawSig, timestamp, reqParam(req, 'amount'));
            return res.json(result);
        }
        catch (err) {
            console.log('-----getSignedDataForClaim error', err);
            return res.json({ result: false, error: 'claim was failed' });
        }
    },
    updateProfile: async function (req, res, next) {
        let address = reqParam(req, paramNames.address);
        const authResult = isValidAccount(address, reqParam(req, paramNames.timestamp), reqParam(req, paramNames.sig));
        if (!authResult) return res.json({ error: true });
        const updateAccountOptions = {};
        Object.keys(userProfileKeys).map(key => {
            const reqVal = reqParam(req, userProfileKeys[key]);
            if (reqVal && reqVal !== 'undefined' && reqVal !== 'null') updateAccountOptions[key] = reqVal;
        });
        const coverImgFile = req.files?.coverImg?.[0];
        const avatarImgFile = req.files?.avatarImg?.[0];
        console.log(JSON.parse(JSON.stringify(req.body)), req.body);
        const accountItem = await Account.findOne({ address: address.toLowerCase() }).lean();
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
        await Account.updateOne({ address: address.toLowerCase() }, updateAccountOptions, overrideOptions);
        let result = { result: true };
        return res.json(result);

    },
}
module.exports = { ApiController };