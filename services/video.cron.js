/**
 * this cron job gets info and converts videos if needed by processing video files 
 */
const mongoose = require("mongoose")
require('dotenv').config()
const ethers = require('ethers');
const { BigNumber } = ethers
const fs = require('fs');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
// const Token = require('../models/Token')

const ContractAbi = require('../abis/StreamNft.json');
const { config } = require("../config");
const { Token } = require("../models/Token");
const { EXPIRED_TIME_FOR_MINTING } = require("../shared/contants");
const IDCounter = require("../models/IDCounter");
const { defaultVideoFilePath, defaultImageFilePath } = require("../utils/file");
const { WatchHistory } = require("../models/WatchHistory");
const { streamInfoKeys, supportedTokens, overrideOptions } = require("../config/constants");
const { Reward } = require("../models/Reward");
const { Balance } = require("../models/Balance");
const { watch } = require("../models/IDCounter");
const { normalizeAddress } = require("../utils/format");
// const privatekey = require("../privatekey");
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_ENDPOINT);

const NFTContract = new ethers.Contract(process.env.DEFAULT_COLLECTION, ContractAbi, provider)

const MINT_STATUS = {
    minted: 'minted',
    signed: 'signed',
    pending: 'pending'
}
const zeroAddress = '0x0000000000000000000000000000000000000000';

async function deleteExpiredTokenItems() {
    const expiredTokenItems = await Token.find({ status: MINT_STATUS.signed, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } });
    if (expiredTokenItems.length < 1) return;
    // delete video files and image files
    expiredTokenItems.map((tokenItem) => {
        let filePath = defaultVideoFilePath(tokenItem.tokenId, tokenItem.videoExt);
        fs.unlink(filePath, error => { if (error) console.log('delete file error!') });
        filePath = defaultImageFilePath(tokenItem.tokenId, tokenItem.imageExt);
        fs.unlink(filePath, error => { if (error) console.log('delete file error!') });
    })
    const deletedTokenIds = expiredTokenItems.map(e => e.tokenId);
    await IDCounter.updateOne({ id: 'tokenId' }, { $push: { expiredIds: deletedTokenIds } });
    const result = await Token.deleteMany({ tokenId: { $in: deletedTokenIds } });
    console.log('--deleted expired tokens', deletedTokenIds.length, result);
}

async function fullVideoInfo() {
    const tokenItems = await Token.find({ videoDuration: null });
    tokenItems.map((tokenItem) => {
        const videoFilePath = defaultVideoFilePath(tokenItem.tokenId, tokenItem.videoExt);
        ffprobe(videoFilePath, { path: ffprobeStatic.path }).then((videoInfo) => {
            const videoDuration = videoInfo?.streams?.[0]?.duration;
            Token.updateOne({ tokenId: tokenItem.tokenId }, { videoDuration }).then();
        }).catch(e => {
            console.log('---error from ffprobe', e);
        })
    })
}

async function processingFundsForPlayingStreams() {
    let pendingStreamsForProcessing = await WatchHistory.find({ $or: [{ status: null }, { status: 'created' }] }).lean();
    console.log('--processing watch streams', pendingStreamsForProcessing.length, new Date());
    for (let i = 0; i < pendingStreamsForProcessing.length; i++) {
        const watchStream = pendingStreamsForProcessing[i];
        const _id = watchStream._id;
        const watchedTime = watchStream.exitedAt.getTime() - watchStream.createdAt.getTime();
        // console.log('-watch history:', watchStream.tokenId, watchStream.watcherAddress, watchedTime);
        // const bExpired = watchedTime <= config.watchTimeForConfirming && watchStream.exitedAt < new Date(Date.now() - 2 * config.extraPeriodForHistory);
        // const tokenItem = await Token.findOne({ tokenId: watchStream.tokenId }, { streamInfo: 1, owner: 1 }).lean();
        // funds for pay per view stream
        // if (tokenItem.streamInfo?.[streamInfoKeys.isPayPerView]) {
        //     const decBalance = Number(tokenItem.streamInfo?.[streamInfoKeys.payPerViewAmount]);
        //     const ppvTokenSymbol = tokenItem.streamInfo?.[streamInfoKeys.payPerViewTokenSymbol] || config.defaultTokenSymbol;
        //     const chainId = watchStream?.chainId || config.defaultChainId;
        //     const ppvToken = supportedTokens.find(e => e.symbol === ppvTokenSymbol && e.chainId === chainId);
        //     console.log('--pay per view', watchStream.tokenId, watchStream.watcherAddress, ppvToken.symbol, decBalance);
        //     const balanceItem = await Balance.findOne(
        //         { address: watchStream.watcherAddress, chainId: watchStream.chainId, tokenAddress: normalizeAddress(ppvToken.address) },
        //         { balance: 1, lockForPPV: 1 }).lean();
        //     if (!watchStream.status || watchStream.status === 'created') {
        //         if (bExpired) {
        //             await WatchHistory.deleteOne({ _id: watchStream._id });
        //             continue;
        //         }
        //         if (!balanceItem || balanceItem.balance < decBalance) {
        //             await WatchHistory.updateOne({ _id }, { status: 'failedForPPV' });
        //             continue;
        //         }
        //         else {
        //             await Balance.updateOne(
        //                 { _id: balanceItem._id },
        //                 { $inc: { balance: -decBalance, lockForPPV: decBalance } });
        //             await WatchHistory.updateOne({ _id }, { status: 'lockForPPV' });
        //             continue;
        //         }
        //     }
        //     else if (watchStream.status === 'lockForPPV') {
        //         if (watchedTime > config.watchTimeForConfirming) {
        //             await Balance.updateOne({ address: watchStream.watcherAddress, chainId: watchStream.chainId, tokenAddress: ppvToken.address },
        //                 { $inc: { lockForPPV: -decBalance } });
        //             const reward = decBalance * (1 - config.developerFee);
        //             if (tokenItem.owner) {
        //                 await Balance.updateOne({ address: tokenItem.owner, chainId: watchStream.chainId, tokenAddress: ppvToken.address },
        //                     { $inc: { balance: reward, reward } }, overrideOptions);
        //                 await Reward.create({ address: tokenItem.owner, rewardAmount: reward, tokenId: watchStream.tokenId, from: watchStream.watcherAddress, chainId });
        //                 await Token.updateOne({ tokenId: watchStream.tokenId }, { $inc: { totalFunds: reward } });
        //             }
        //             await WatchHistory.updateOne({ _id: watchStream._id }, { fundedTokenValue: decBalance, status: 'confirmed' });
        //             await Token.updateOne({ tokenId: watchStream.tokenId }, { $inc: { views: 1 } });
        //         } else if (bExpired) {
        //             await Balance.updateOne(
        //                 { _id: balanceItem._id },
        //                 { $inc: { balance: decBalance, lockForPPV: -decBalance } });
        //             await WatchHistory.deleteOne({ _id: watchStream._id });
        //             continue;
        //         }
        //     }
        // }
        // else 
        if (watchedTime > config.watchTimeForConfirming) {
            await WatchHistory.updateOne({ _id }, { status: 'confirmed' });
            await Token.updateOne({ tokenId: watchStream.tokenId }, { $inc: { views: 1 } });
        } else if (watchStream.exitedAt < new Date(Date.now() - 2 * config.extraPeriodForHistory)) {
            await WatchHistory.deleteOne({ _id });
        }
    }
}

async function cronLoop() {
    await fullVideoInfo();
    await deleteExpiredTokenItems();
    await processingFundsForPlayingStreams();
    setTimeout(cronLoop, 10 * 1000);
}
/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- processing video files...');
        // await deleteExpiredTokenItems();
        cronLoop();
    });