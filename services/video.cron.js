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

async function cronLoop() {
    await fullVideoInfo();
    await deleteExpiredTokenItems();
    setTimeout(cronLoop, 10 * 1000);
}
/// -- minter listener
mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName,
    { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false }).then(async () => {
        console.log(' -- processing video files...');
        // await deleteExpiredTokenItems();
        cronLoop();
        // await getPastEvent('Transfer')
    });