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
const { streamInfoKeys, supportedTokens, overrideOptions, RewardType } = require("../config/constants");
const { Reward } = require("../models/Reward");
const { Balance } = require("../models/Balance");
const { watch } = require("../models/IDCounter");
const { normalizeAddress } = require("../utils/format");
const { getTotalBountyAmount } = require("../utils/calc");
const { payBounty } = require("../controllers/user");
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
    for (const watchStream of pendingStreamsForProcessing) {
        const _id = watchStream._id;
        const watchedTime = watchStream.exitedAt.getTime() - watchStream.createdAt.getTime();
        if (watchedTime > config.watchTimeForConfirming) {
            const tokenFilter = { tokenId: watchStream.tokenId };
            await payBounty(watchStream.watcherAddress, watchStream.tokenId, RewardType.BountyForViewer);
            await WatchHistory.updateOne({ _id }, { status: 'confirmed' });
            await Token.updateOne(tokenFilter, { $inc: { views: 1 } });
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
        console.log(' -- processing video files and watched streams...');        
        cronLoop();
    });