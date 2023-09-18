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
const { streamInfoKeys, supportedTokens, overrideOptions, RewardType, supportedNetworks, ChainId } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { getTotalBountyAmount } = require("../utils/calc");
const { updateVideoInfo, transcodeVideo } = require('../utils/stream');
const { payBounty } = require("../controllers/user");
const { deleteVotedStream } = require("../controllers/vote");
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { Setting } = require("../models/Setting");
const { multicallRead, getCreatorsForTokenIds } = require("../utils/web3");
const Collection = require("../models/Collection");
const { ethers } = require("ethers");

const MINT_STATUS = {
    minted: 'minted',
    signed: 'signed',
    pending: 'pending',
    confirmed: 'confirmed',
    failed: 'failed',
}

async function deleteExpiredClaimTx() {
    const setting = await Setting.findOne({}).lean();
    const claimTxs = await ClaimTransaction.find({ status: MINT_STATUS.pending, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } }).lean();
    for (const claimTx of claimTxs) {
        // if not synced, not delete
        if (setting.syncedDiffTimeOfGraph?.[claimTx.chainId] > 60) continue;
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
    const tokenItemsByChainIds = await Token.aggregate([
        { $match: { status: MINT_STATUS.signed, createdAt: { $lt: new Date(new Date() - EXPIRED_TIME_FOR_MINTING) } } },
        {
            $lookup: {
                from: 'collections',
                localField: 'contractAddress',
                foreignField: 'address',
                as: 'collection'
            }
        },
        {
            $group: {
                _id: "$chainId",
                nfts: { $push: { address: "$contractAddress", tokenId: "$tokenId", collection: "$collection" } }
            }
        }
    ]);
    const tokenItemsToDelete = [];
    const mintedTokenIds = [];
    for (const nftItems of tokenItemsByChainIds) {
        const chainId = nftItems._id || config.defaultChainId;
        console.log('chainId: ', chainId);
        const aa = [];
        nftItems.nfts.map(e => {
            const a = { type: '721', address: e.address, tokenId: e.tokenId };
            if (e.collection?.[0]?.type === '1155') a.type = '1155';
            aa.push(a);
        });
        // console.log(aa.filter((c, index) => aa.findIndex(e=>e.address === c.address) === index));
        const creators = await getCreatorsForTokenIds(chainId, aa);
        if (creators) {
            for (const nftItem of nftItems.nfts) {
                if (creators[nftItem.tokenId] && creators[nftItem.tokenId] !== ethers.constants.AddressZero) {
                    mintedTokenIds.push(nftItem.tokenId);
                }
                else {
                    tokenItemsToDelete.push(expiredTokenItems.find(e => e.tokenId === nftItem.tokenId));
                }
            }
        }
    }
    // const tokenIds = expiredTokenItems.map(e => e.tokenId);
    // console.log(tokenIds);
    // return;
    // for (const tokenItem of expiredTokenItems) {
    // not delete video files and image files
    // let filePath = defaultVideoFilePath(tokenItem.tokenId, tokenItem.videoExt);
    // fs.unlink(filePath, error => { if (error) console.log('delete file error!') });
    // filePath = defaultImageFilePath(tokenItem.tokenId, tokenItem.imageExt);
    // fs.unlink(filePath, error => { if (error) console.log('delete file error!') });
    // processing unlock of bounty amount
    // const streamInfo = tokenItem.streamInfo;
    // const addBountyTotalAmount = getTotalBountyAmount(streamInfo);
    // if (addBountyTotalAmount) {
    //     const bountyAmountWithFee = getTotalBountyAmount(streamInfo, true);
    //     const bountyToken = supportedTokens.find(e => e.symbol === streamInfo[streamInfoKeys.addBountyTokenSymbol] && e.chainId === Number(streamInfo[streamInfoKeys.addBountyChainId]));
    //     const balanceFilter = { address: tokenItem.minter, tokenAddress: bountyToken?.address?.toLowerCase(), chainId: Number(streamInfo[streamInfoKeys.addBountyChainId]) };
    //     let balanceItem = await Balance.findOne(balanceFilter).lean();
    //     if (balanceItem.lockForBounty < addBountyTotalAmount) {
    //         console.log(`insufficient locked to add bounty`, tokenItem.tokenId, tokenItem.minter, balanceItem.lockForBounty);
    //     }
    //     balanceItem = await Balance.findOneAndUpdate(balanceFilter, { $inc: { balance: bountyAmountWithFee, lockForBounty: -addBountyTotalAmount } }, overrideOptions);
    //     console.log('unlocked bounty stream', tokenItem.tokenId, balanceFilter, 'total bounty:', bountyAmountWithFee);
    //     await Balance.updateOne({ ...balanceFilter, address: config.devWalletAddress }, { $inc: { balance: -(bountyAmountWithFee - addBountyTotalAmount) } }, overrideOptions);
    // }
    // }
    const deletedTokenIds = tokenItemsToDelete.map(e => e.tokenId);
    if (deletedTokenIds.length > 0) {
        console.log('---deleted tokens:', deletedTokenIds);
        await IDCounter.updateOne({ id: 'tokenId' }, { $push: { expiredIds: deletedTokenIds } });
        const result = await Token.updateMany({ tokenId: { $in: deletedTokenIds } }, { status: 'failed' });
        console.log('--deleted expired tokens', deletedTokenIds.length, result);
    }

    if (mintedTokenIds.length > 0) {
        console.log('---minted:', mintedTokenIds);
        const result2 = await Token.updateMany({ tokenId: { $in: mintedTokenIds } }, { status: 'checking' });
        console.log('--checking tokens', result2);
    }
}

async function transcodeVideos() {
    const transcodingCount = await Token.countDocuments({ transcodingStatus: 'on' });
    if (transcodingCount > 1) {
        console.log('---transcoding: ', transcodingCount);
        return;
    }
    const tokenItems = await Token.find({ transcodingStatus: null, videoInfo: { $ne: null }, status: { $ne: 'failed' } }, { tokenId: 1, videoExt: 1 }).limit(1).lean();
    for (const tokenItem of tokenItems) {
        await transcodeVideo(tokenItem.tokenId, tokenItem.videoExt);
    }
}

async function fullVideoInfo() {
    const tokenItems = await Token.find({ videoInfo: null, transcodingStatus: { $ne: 'failed' } }, { tokenId: 1, videoExt: 1, }).lean();
    for (const tokenItem of tokenItems) {
        await updateVideoInfo(tokenItem.tokenId, tokenItem.videoExt);
    }
}

async function processWatchHistory() {
    let pendingStreamsForProcessing = await WatchHistory.find({ $or: [{ status: null }, { status: 'created' }] }).lean();
    console.log('--processing watch streams', pendingStreamsForProcessing.length, new Date());
    for (const watchStream of pendingStreamsForProcessing) {
        const _id = watchStream._id;
        const watchedTime = watchStream.exitedAt.getTime() - watchStream.createdAt.getTime();
        const tokenItem = await Token.findOne({ tokenId: watchStream.tokenId }, { videoDuration: 1, _id: 0 }).lean();
        let minimumWatchTime = tokenItem.videoDuration * 300;
        if (minimumWatchTime < 6000) minimumWatchTime = 100; // shorter than 20s
        if (tokenItem && watchedTime >= (Math.min(config.watchTimeForConfirming, minimumWatchTime))) {
            const tokenFilter = { tokenId: watchStream.tokenId };
            // await payBounty(watchStream.watcherAddress, watchStream.tokenId, RewardType.BountyForViewer);
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
    // await deleteExpiredClaimTx();
    await fullVideoInfo();
    await transcodeVideos();
    await deleteExpiredTokenItems();
    await processWatchHistory();
    if (autoDeleteCronCounter++ % (config.periodOfDeleleCron / 10) == 0) await deleteVotedStreams();
    setTimeout(cronLoop, 10 * 1000);
}
/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- processing video files and watched streams...');
        cronLoop();
    });