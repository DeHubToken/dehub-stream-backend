const { Account } = require('../models/Account');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { isValidAccount, reqParam } = require('../utils/auth');
const { Token } = require('../models/Token');
const nftMetaDataTemplate = require('../data_structure/nft_metadata_template.json');
const { defaultImageFilePath } = require('../utils/file');
const { WatchHistory } = require('../models/WatchHistory');
const { streamInfoKeys, supportedTokens, overrideOptions } = require('../config/constants');
const { config } = require('../config');
const { isAddress } = require('ethers/lib/utils');
const { Balance } = require('../models/Balance');
const { normalizeAddress } = require('../utils/format');
const { isUnlockedPPVStream, isUnlockedLockedContent } = require('../utils/validation');
const sharp = require('sharp');
const defaultLimitBuffer = 1 * 1024 * 1024; // 2M
const defaultInitialBuffer = 160 * 1024; // first 160k is free
const tokenTemplateForStream = {
  owner: 1,
  streamInfo: 1,
  videoInfo: 1,
};
const StreamController = {
  getStream: async function (req, res, next) {
    let tokenId = req.params.id;
    const signParams = req.query;
    // { sig: '', timestamp: '0', account: 'undefined' } when not connecting with wallet
    if (!tokenId) return res.json({ error: 'error!' });
    try {
      tokenId = parseInt(tokenId);
    } catch (e) {
      return res.json({ error: 'error!' });
    }
    console.log('----start stream:', tokenId);
    const tokenItem = await Token.findOne({ tokenId, status: 'minted' }, tokenTemplateForStream).lean();
    if (!tokenItem) return res.json({ error: 'no stream!' });
    const videoPath = `${path.dirname(__dirname)}/assets/videos/${tokenId}.mp4`;
    let fileSize;
    if (tokenItem.videoInfo?.size) {
      fileSize = tokenItem.videoInfo?.size;
    } else {
      try {
        let videoStat;
        videoStat = fs.statSync(videoPath);
        fileSize = videoStat.size;
      } catch {
        console.log('----not video', tokenId);
        return res.json({ error: 'error!' });
      }
    }
    const videoRange = req.headers.range;
    const nowTimestamp = Date.now();
    const userAddress = signParams?.account?.toLowerCase();
    const limitBuffer = tokenItem.videoInfo?.bitrate
      ? Math.floor((tokenItem.videoInfo?.bitrate / 8) * 6)
      : defaultLimitBuffer;
    const initialBuffer = tokenItem.videoInfo?.bitrate
      ? Math.floor((tokenItem.videoInfo?.bitrate / 8) * 2)
      : defaultInitialBuffer;
    // let chainId = signParams?.chainId;
    // if (chainId) chainId = parseInt(chainId);
    if (videoRange) {
      const parts = videoRange.replace(/bytes=/, '').split('-');
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      let chunksize = end - start + 1;
      // const oldChunkSize = chunksize;
      // watching video at start position is always available.
      if (videoRange === 'bytes=0-') {
        start = 0;
        chunksize = chunksize > initialBuffer + 1 ? initialBuffer + 1 : chunksize;
        end = chunksize - 1;
      } else {
        if (chunksize > limitBuffer + 1) {
          chunksize = limitBuffer + 1;
          end = start + chunksize - 1;
        }
        if (
          tokenItem?.owner !== normalizeAddress(userAddress) &&
          (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent] ||
            tokenItem?.streamInfo?.[streamInfoKeys.isPayPerView])
        ) {
          // check signature for not start
          const result = isValidAccount(signParams?.account, signParams?.timestamp, signParams.sig);
          // return res.json({ error: 'error!' });  // for testing
          if (!result) {
            console.log('failed account auth', signParams);
            return res.status(500).send('error!');
            // chunksize = 100;
            // end = start + chunksize - 1;
          }
          if (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent]) {
            const isUnlocked = await isUnlockedLockedContent(tokenItem?.streamInfo, userAddress);
            if (!isUnlocked) {
              return res.status(500).send('error!');
            }
          } // per view stream
          else {
            const isUnlocked = await isUnlockedPPVStream(tokenId, userAddress);
            if (!isUnlocked) return res.status(500).send('error!');
          }
        }
      }
      console.log(
        '---call stream',
        nowTimestamp,
        signParams?.account,
        tokenId,
        req.headers.range,
        start,
        end,
        fileSize,
      );
      const file = fs.createReadStream(videoPath, { start, end });
      const header = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(206, header);
      file.pipe(res);
      let filter = { tokenId, exitedAt: { $gt: new Date(nowTimestamp - config.extraPeriodForHistory) } };
      if (userAddress && isAddress(userAddress)) {
        filter = { ...filter, watcherAddress: userAddress };
        await WatchHistory.updateOne(
          filter,
          { exitedAt: new Date(nowTimestamp), lastWatchedFrame: end },
          overrideOptions,
        );
      }
    } else return res.status(500).send('error!');
  },
  getImage: async function (req, res, next) {
    const id = req.params.id;
    if (!id) return res.json({ error: 'not image' });
    const tokenItem = await Token.findOne({ tokenId: parseInt(id) }, { tokenId: 1, imageExt: 1 }).lean();
    if (tokenItem) {
      const imageLocalFilePath = defaultImageFilePath(parseInt(id), tokenItem.imageExt);
      console.log(imageLocalFilePath);

      // Will have to compress all the images on server later and make sure it gets compressed before it gets stored
      const compressedImage = await sharp(imageLocalFilePath).resize({ width: 450 }).toBuffer();

      res.set('Content-Type', 'image/png');
      res.set('Content-Length', compressedImage.length);
      // const sizeInMegabytes = compressedImage.length / (1024 * 1024);
      // console.log(`${sizeInMegabytes.toFixed(2)} MB`);

      return res.send(compressedImage);
      // return res.sendFile(imageLocalFilePath);
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
    if (!tokenItem) return JSON.stringify({});
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
      });
    }
    return res.json(nftMetaDataTemplate);
  },
};
module.exports = { StreamController };
