let BaseController = require('./BaseController');
const { Account } = require('../models/Account');
const path = require("path");
const fs = require('fs');
require("dotenv").config();
const { isValidAccount, reqParam } = require('../utils/auth');
const { Token } = require('../models/Token');
const nftMetaDataTemplate = require('../data_structure/nft_metadata_template.json');
const { defaultImageFilePath } = require('../utils/file');
const { WatchHistory } = require('../models/WatchHistory');
const { streamInfoKeys } = require('../config/constants');
const { config } = require('../config');
const { isAddress } = require('ethers/lib/utils');
const limitBuffer = 1 * 1024 * 1024; // 2M
const initialBuffer = 80 * 1024; // first 80k is free

const StreamController = {
    getStream: async function (req, res, next) {
        let tokenId = req.params.id;
        const signParams = req.query;
        // { sig: '', timestamp: '0', account: 'undefined' } when not connecting with wallet
        if (!tokenId) return res.json({ error: 'error!' });
        try {
            tokenId = parseInt(tokenId);
        }
        catch (e) {
            return res.json({ error: 'error!' });
        }
        const tokenItem = await Token.findOne({ tokenId }).lean();
        if (!tokenItem) return res.json({ error: 'no stream!' });

        const videoPath = `${path.dirname(__dirname)}/assets/videos/${tokenId}.mp4`;
        const videoStat = fs.statSync(videoPath);
        const fileSize = videoStat.size;
        const videoRange = req.headers.range;
        if (videoRange) {
            const parts = videoRange.replace(/bytes=/, "").split("-");
            let start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            let chunksize = end - start + 1;
            const oldChunkSize = chunksize;

            if (videoRange === 'bytes=0-') {
                start = 0;
                chunksize = initialBuffer + 1;
                end = chunksize - 1;
            }
            else {
                if (chunksize > limitBuffer + 1) {
                    chunksize = limitBuffer + 1;
                    end = start + chunksize - 1;
                }
                // check signature for not start
                const result = isValidAccount(signParams?.account, signParams?.timestamp, signParams.sig);
                // return res.json({ error: 'error!' });  // for testing
                if (!result) {
                    console.log(result);                    
                    return res.status(500).send('error!');
                    // chunksize = 100;
                    // end = start + chunksize - 1;              
                }
                let chainId = signParams?.chainId;
                if(chainId) chainId = parseInt(chainId);
                if (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent] || tokenItem?.streamInfo?.[streamInfoKeys.isPayPerView]) {
                    const accountItem = await Account.findOne({ address: signParams?.account?.toLowerCase() }, { balance: 1, dhbBalance: 1 });
                    if (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent]) {
                        const lockContentAmount = Number(tokenItem?.streamInfo?.[streamInfoKeys.lockContentAmount]);
                        if (lockContentAmount > accountItem.dhbBalance) {
                            return res.status(500).send('error!');
                        }
                    }
                    else // per view stream
                    {
                        const payPerViewAmount = Number(tokenItem?.streamInfo?.[streamInfoKeys.payPerViewAmount]);
                        if (payPerViewAmount > accountItem.balance) {
                            return res.status(500).send('error!');
                        }
                    }
                }

            }

            console.log('---signParams', signParams, req.headers.range, end, oldChunkSize, chunksize);
            const file = fs.createReadStream(videoPath, { start, end });
            const header = {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize,
                "Content-Type": "video/mp4",
            };

            res.writeHead(206, header);
            file.pipe(res);
            if (signParams?.account && isAddress(signParams?.account)) {
                const nowTime = new Date();
                const updatedResult = await WatchHistory.updateOne(
                    { tokenId, watcherAddress: signParams?.account, exitedAt: { $gt: new Date(nowTime - config.extraRecordSpaceSecond * 1000) } },
                    { exitedAt: nowTime, lastWatchedFrame: end }, { upsert: true, new: true, setDefaultsOnInsert: true });
                if (updatedResult && updatedResult.upserted && updatedResult.upserted.length > 0) {
                    await Token.updateOne({ tokenId }, { $inc: { views: 1 } });
                    console.log('----update views nft', tokenId);
                }
            }
            // } else {
            //     const head = {
            //         'Content-Length': fileSize,
            //         'Content-Type': 'video/mp4',
            //     };
            //     res.writeHead(200, head);
            //     fs.createReadStream(videoPath).pipe(res);
        }
    },
    getImage: async function (req, res, next) {
        const id = req.params.id;
        if (!id) return res.json({ error: 'not image' });
        const tokenItem = await Token.findOne({ tokenId: parseInt(id) }, { tokenId: 1, imageExt: 1 }).lean();
        if (tokenItem) {
            const imageLocalFilePath = defaultImageFilePath(parseInt(id), tokenItem.imageExt);
            // console.log(imageLocalFilePath);
            return res.sendFile(imageLocalFilePath);
        }
        return res.json({ error: 'no token' });
    },
    getMetaData: async function (req, res, next) {
        const tokenId = req.params.id;
        if (!tokenId) return json({});
        const tokenTemplate = {
            name: 1,
            description: 1,
            tokenId: 1,
            imageUrl: 1,
            videoUrl: 1,
            owner: 1,
            minter: 1,
            streamInfo: 1,
            type: 1,
            _id: 0,
        };
        const filter = { tokenId: parseInt(tokenId) };
        const tokenItem = await Token.findOne(filter, tokenTemplate).lean();
        if (!tokenItem) return json({});
        const result = JSON.parse(JSON.stringify(nftMetaDataTemplate));
        nftMetaDataTemplate.name = tokenItem.name;
        nftMetaDataTemplate.description = tokenItem.description;
        nftMetaDataTemplate.image = process.env.DEFAULT_DOMAIN + '/' + tokenItem.imageUrl;
        const mediaUrlPrefix = process.env.DEFAULT_DOMAIN + '/';
        nftMetaDataTemplate.external_url = mediaUrlPrefix + tokenItem.videoUrl;

        if (!tokenItem.symbol) delete nftMetaDataTemplate.symbol;
        if (!tokenItem.streamInfo) delete nftMetaDataTemplate.attributes;
        else {
            nftMetaDataTemplate.attributes = [];
            Object.keys(tokenItem.streamInfo).map(e => {
                nftMetaDataTemplate.attributes.push({ trait_type: e, value: tokenItem.streamInfo[e] });
            })
        }
        return res.json(nftMetaDataTemplate);
    },
}
module.exports = { StreamController };