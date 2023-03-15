/**
 * this cron job gets info and converts videos if needed by processing video files 
 */
const mongoose = require("mongoose");
require('dotenv').config();
const fs = require('fs');
const { config } = require("../config");
const { Token } = require("../models/Token");
const { EXPIRED_TIME_FOR_MINTING } = require("../shared/contants");
const IDCounter = require("../models/IDCounter");
const { defaultVideoFilePath, defaultImageFilePath } = require("../utils/file");
const { WatchHistory } = require("../models/WatchHistory");
const { streamInfoKeys, supportedTokens, overrideOptions, RewardType } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { getTotalBountyAmount } = require("../utils/calc");
const { updateVideoInfo, transcodeVideo } = require('../utils/stream');
const { payBounty } = require("../controllers/user");
const { deleteVotedStream } = require("../controllers/vote");
const { ClaimTransaction } = require("../models/ClaimTransaction");

const MINT_STATUS = {
    minted: 'minted',
    signed: 'signed',
    pending: 'pending',
    confirmed: 'confirmed',
    failed: 'failed',
}

async function deleteExpiredClaimTx() {
    const claimTxs = await ClaimTransaction.find({ status: MINT_STATUS.pending, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } }).lean();
    for (const claimTx of claimTxs) {
        const balanceFilter = { address: claimTx.receiverAddress, chainId: claimTx.chainId, tokenAddress: claimTx.tokenAddress };
        const balanceItem = await Balance.findOne(balanceFilter).lean();
        if (balanceItem.pending >= claimTx.amount) {
            // release pending
            console.log('expired claim', balanceFilter);
            await Balance.updateOne(balanceFilter, { $inc: { balance: claimTx.amount, pending: -claimTx.amount } });
            await ClaimTransaction.updateOne({ _id: claimTx._id }, { status: MINT_STATUS.failed });
        }
    }
}

async function deleteExpiredTokenItems() {
    const expiredTokenItems = await Token.find({ status: MINT_STATUS.signed, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } });
    if (expiredTokenItems.length < 1) return;
    for (const tokenItem of expiredTokenItems) {
        // delete video files and image files
        let filePath = defaultVideoFilePath(tokenItem.tokenId, tokenItem.videoExt);
        fs.unlink(filePath, error => { if (error) console.log('delete file error!') });
        filePath = defaultImageFilePath(tokenItem.tokenId, tokenItem.imageExt);
        fs.unlink(filePath, error => { if (error) console.log('delete file error!') });
        // processing unlock of bounty amount
        const streamInfo = tokenItem.streamInfo;
        const addBountyTotalAmount = getTotalBountyAmount(streamInfo);
        if (addBountyTotalAmount) {
            const bountyAmountWithFee = getTotalBountyAmount(streamInfo, true);
            const bountyToken = supportedTokens.find(e => e.symbol === streamInfo[streamInfoKeys.addBountyTokenSymbol] && e.chainId === Number(streamInfo[streamInfoKeys.addBountyChainId]));
            const balanceFilter = { address: tokenItem.minter, tokenAddress: bountyToken?.address?.toLowerCase(), chainId: Number(streamInfo[streamInfoKeys.addBountyChainId]) };
            let balanceItem = await Balance.findOne(balanceFilter).lean();
            if (balanceItem.lockForBounty < addBountyTotalAmount) {
                console.log(`insufficient locked to add bounty`, tokenItem.tokenId, tokenItem.minter, balanceItem.lockForBounty);
            }
            balanceItem = await Balance.findOneAndUpdate(balanceFilter, { $inc: { balance: bountyAmountWithFee, lockForBounty: -addBountyTotalAmount } }, overrideOptions);
            console.log('unlocked bounty stream', tokenItem.tokenId, balanceFilter, 'total bounty:', bountyAmountWithFee);
            await Balance.updateOne({ ...balanceFilter, address: config.devWalletAddress }, { $inc: { balance: -(bountyAmountWithFee - addBountyTotalAmount) } }, overrideOptions);
        }
    }
    const deletedTokenIds = expiredTokenItems.map(e => e.tokenId);
    await IDCounter.updateOne({ id: 'tokenId' }, { $push: { expiredIds: deletedTokenIds } });
    const result = await Token.deleteMany({ tokenId: { $in: deletedTokenIds } });
    console.log('--deleted expired tokens', deletedTokenIds.length, result);
}

async function transcodeVideos() {
    const transcodingCount = await Token.countDocuments({ transcodingStatus: 'on' });
    if (transcodingCount > 1) {
        console.log('---transcoding: ', transcodingCount);
        return;
    }
    const tokenItems = await Token.find({ transcodingStatus: null, videoInfo: { $ne: null } }, { tokenId: 1, videoExt: 1 }).limit(1).lean();
    for (const tokenItem of tokenItems) {
        await transcodeVideo(tokenItem.tokenId, tokenItem.videoExt);
    }
}

async function fullVideoInfo() {
    const tokenItems = await Token.find({ videoInfo: null }, { tokenId: 1, videoExt: 1, }).lean();
    for (const tokenItem of tokenItems) {
        await updateVideoInfo(tokenItem.tokenId, tokenItem.videoExt);
    }
}

async function processingFundsForPlayingStreams() {
    let pendingStreamsForProcessing = await WatchHistory.find({ $or: [{ status: null }, { status: 'created' }] }).lean();
    console.log('--processing watch streams', pendingStreamsForProcessing.length, new Date());
    for (const watchStream of pendingStreamsForProcessing) {
        const _id = watchStream._id;
        const watchedTime = watchStream.exitedAt.getTime() - watchStream.createdAt.getTime();
        const tokenItem = await Token.findOne({ tokenId: watchStream.tokenId }, { videoDuration: 1, _id: 0 }).lean();
        if (watchedTime >= (Math.min(config.watchTimeForConfirming, tokenItem.videoDuration * 0.5))) {
            const tokenFilter = { tokenId: watchStream.tokenId };
            await payBounty(watchStream.watcherAddress, watchStream.tokenId, RewardType.BountyForViewer);
            await WatchHistory.updateOne({ _id }, { status: 'confirmed' });
            await Token.updateOne(tokenFilter, { $inc: { views: 1 } });
        } else if (watchStream.exitedAt < new Date(Date.now() - 2 * config.extraPeriodForHistory)) {
            await WatchHistory.deleteOne({ _id });
        }
    }
}

async function deleteVotedStreams() {
    console.log('-- checking voted streams');
    const tokenItems = await Token.find({ status: { $ne: 'deleted' }, ['totalVotes.against']: { $gte: config.votesForDeleting * 0.9 } });
    for (const tokenItem of tokenItems) {
        await deleteVotedStream(tokenItem);
    }
}
let autoDeleteCronCounter = 0;
async function cronLoop() {
    await deleteExpiredClaimTx();
    await fullVideoInfo();
    await transcodeVideos();
    await deleteExpiredTokenItems();
    await processingFundsForPlayingStreams();
    if (autoDeleteCronCounter++ % (config.periodOfDeleleCron / 10) == 0) await deleteVotedStreams();
    setTimeout(cronLoop, 10 * 1000);
}
/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- processing video files and watched streams...');
        cronLoop();
    });