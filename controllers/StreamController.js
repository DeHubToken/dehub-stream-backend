let BaseController = require('./BaseController');
const { Account } = require('../models/Account');
const path = require("path");
const fs = require('fs');
require("dotenv").config();
const { ethers, FixedNumber } = require('ethers');
const { splitSignature } = require('@ethersproject/bytes');
const { isValidAccount, reqParam } = require('../utils/auth');
const { decryptWithSourceKey, encryptWithSourceKey } = require('../utils/encrypt');
const { paramNames, errorMsgs } = require('../config/constants');
const { Token } = require('../models/Token');
const { checkFileType } = require('../utils/format');
const { signatureForMintingNFT } = require('./mintNft');
const nftMetaDataTemplate = require('../data_structure/nft_metadata_template.json');
const expireTime = 86400000;
const limitBuffer = 2 * 1024 * 1024; // 2M
const initialBuffer = 80 * 1024; // first 60k is free
const StreamController = {
    getStream: async function (req, res, next) {
        const tokenId = req.params.id;
        const signParams = req.query;
        // { sig: '', timestamp: '0', account: 'undefined' } when not connecting with wallet
        if (!tokenId) return res.json({ error: 'error!' });
        const videoPath = `${path.dirname(__dirname)}/assets/videos/${parseInt(tokenId)}.mp4`;
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
            // } else {
            //     const head = {
            //         'Content-Length': fileSize,
            //         'Content-Type': 'video/mp4',
            //     };
            //     res.writeHead(200, head);
            //     fs.createReadStream(videoPath).pipe(res);
        }
    }
}
module.exports = { StreamController };