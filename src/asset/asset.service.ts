import { Injectable, InternalServerErrorException, BadRequestException,NotFoundException, } from '@nestjs/common';
import { Request, Response } from 'express';
import { TokenModel } from 'models/Token';
import * as fs from 'fs'
import { normalizeAddress } from 'common/util/format';
import { overrideOptions, streamInfoKeys } from 'config/constants';
import { isValidAccount, reqParam } from 'common/util/auth';
import { isUnlockedLockedContent, isUnlockedPPVStream } from 'common/util/validation';
import { isAddress } from 'ethers';
import {config} from 'config';
import { WatchHistoryModel } from 'models/WatchHistory';
import { defaultImageFilePath } from 'common/util/file';
import sharp from 'sharp';
import nftMetaDataTemplate from 'data_structure/nft_metadata_template.json';
import { CdnService } from 'src/cdn/cdn.service';

const defaultLimitBuffer = 1 * 1024 * 1024;
const defaultInitialBuffer = 160 * 1024;

const tokenTemplateForStream = {
  owner: 1,
  streamInfo: 1,
  videoInfo: 1,
}

@Injectable()
export class AssetService {
  constructor(private readonly cdnService:CdnService){}

  async getStream(req: Request, res: Response) {
    let tokenId: any = req.params.id;
    const signParams: any = req.query;
  
    if (!tokenId) {
      throw new BadRequestException('Token Id is required');
    }
  
    try {
      tokenId = parseInt(tokenId);
    } catch (e) {
      throw new BadRequestException('Token Id must be a valid number');
    }
  
    console.log('----start stream:', tokenId);
  
    const tokenItem: any = await TokenModel.findOne(
      { tokenId, status: 'minted' },
      tokenTemplateForStream,
    ).lean();
  
    if (!tokenItem) {
      throw new NotFoundException('Token not found');
    }
  
    const videoPath = `${process.env.CDN_BASE_URL}videos/${tokenId}.mp4`;
    let fileSize;
  
    if (tokenItem.videoInfo?.size) {
      fileSize = tokenItem.videoInfo?.size;
    } else {
      try {
        const videoStat = fs.statSync(videoPath);
        fileSize = videoStat.size;
      } catch (e) {
        console.error('----not video', tokenId);
        throw new InternalServerErrorException(e.message || 'Video not found');
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
  
    if (!videoRange) {
      throw new InternalServerErrorException('No video range specified');
    }
  
    const parts = videoRange.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    let chunksize = end - start + 1;
  
    if (videoRange === 'bytes=0-') {
      start = 0;
      chunksize = Math.min(chunksize, initialBuffer + 1);
      end = start + chunksize - 1;
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
        const result = isValidAccount(signParams?.account, signParams?.timestamp, signParams.sig);
        if (!result) {
          console.log('Failed account auth', signParams);
          // Don't throw error as users still need to watch without auth
          // throw new InternalServerErrorException('Authentication failed');
        }
  
        if (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent]) {
          const isUnlocked = await isUnlockedLockedContent(tokenItem?.streamInfo, userAddress);
          if (!isUnlocked) {
            throw new InternalServerErrorException('Locked content');
          }
        } else {
          const isUnlocked = await isUnlockedPPVStream(tokenId, userAddress);
          if (!isUnlocked) {
            throw new InternalServerErrorException('Locked PPV stream');
          }
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
  
    let filter: any = {
      tokenId,
      exitedAt: { $gt: new Date(nowTimestamp - config.extraPeriodForHistory) },
    };
  
    if (userAddress && isAddress(userAddress)) {
      filter = { ...filter, watcherAddress: userAddress };
      await WatchHistoryModel.updateOne(
        filter,
        { exitedAt: new Date(nowTimestamp), lastWatchedFrame: end },
        overrideOptions,
      );
    }
  }
  // async getStream(req:Request, res:Response) {
  //   let tokenId:any = req.params.id;
  //   const signParams:any = req.query;
  //   // { sig: '', timestamp: '0', account: 'undefined' } when not connecting with wallet
  //   if (!tokenId) return res.status(400).json({ error: 'Bad Request: Token Id is required' });
  //   try {
  //     tokenId = parseInt(tokenId);
  //   } catch (e) {
  //     return res.status(400).json({ error: 'Bad Request: Token Id is required' });
  //   }
  //   console.log('----start stream:', tokenId);
  //   const tokenItem:any = await TokenModel.findOne({ tokenId, status: 'minted' }, tokenTemplateForStream).lean();
  //   if (!tokenItem) return res.status(404).json({ error: 'Not Found: Token not found' });
  //   const videoPath = `${process.env.CDN_BASE_URL}videos/${tokenId}.mp4`;
  //   let fileSize;
  //   if (tokenItem.videoInfo?.size) {
  //     fileSize = tokenItem.videoInfo?.size;
  //   } else {
  //     try {
  //       let videoStat;
  //       videoStat = fs.statSync(videoPath);
  //       fileSize = videoStat.size;
  //     } catch (e) {
  //       console.log('----not video', tokenId);
  //       return res.status(500).json({ error: e.message || 'Internal Server Error' });
  //     }
  //   }
  //   const videoRange = req.headers.range;
  //   const nowTimestamp = Date.now();
  //   const userAddress = signParams?.account?.toLowerCase();
  //   const limitBuffer = tokenItem.videoInfo?.bitrate
  //     ? Math.floor((tokenItem.videoInfo?.bitrate / 8) * 6)
  //     : defaultLimitBuffer;
  //   const initialBuffer = tokenItem.videoInfo?.bitrate
  //     ? Math.floor((tokenItem.videoInfo?.bitrate / 8) * 2)
  //     : defaultInitialBuffer;
  //   // let chainId = signParams?.chainId;
  //   // if (chainId) chainId = parseInt(chainId);
  //   if (videoRange) {
  //     const parts = videoRange.replace(/bytes=/, '').split('-');
  //     let start = parseInt(parts[0], 10);
  //     let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  //     let chunksize = end - start + 1;
  //     // const oldChunkSize = chunksize;
  //     // watching video at start position is always available.
  //     if (videoRange === 'bytes=0-') {
  //       start = 0;
  //       chunksize = chunksize > initialBuffer + 1 ? initialBuffer + 1 : chunksize;
  //       end = chunksize - 1;
  //     } else {
  //       if (chunksize > limitBuffer + 1) {
  //         chunksize = limitBuffer + 1;
  //         end = start + chunksize - 1;
  //       }
  //       if (
  //         tokenItem?.owner !== normalizeAddress(userAddress) &&
  //         (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent] ||
  //           tokenItem?.streamInfo?.[streamInfoKeys.isPayPerView])
  //       ) {
  //         // check signature for not start
  //         const result = isValidAccount(signParams?.account, signParams?.timestamp, signParams.sig);
  //         // return res.json({ error: 'error!' });  // for testing
  //         if (!result) {
  //           console.log('failed account auth', signParams);
  //           // return res.status(500).send('Authentication Error');
  //           // chunksize = 100;
  //           // end = start + chunksize - 1;
  //         }
  //         if (tokenItem?.streamInfo?.[streamInfoKeys.isLockContent]) {
  //           const isUnlocked = await isUnlockedLockedContent(tokenItem?.streamInfo, userAddress);
  //           if (!isUnlocked) {
  //             return res.status(500).send('Locked Content');
  //           }
  //         } // per view stream
  //         else {
  //           const isUnlocked = await isUnlockedPPVStream(tokenId, userAddress);
  //           if (!isUnlocked) return res.status(500).send('A locked PPV stream');
  //         }
  //       }
  //     }
  //     console.log(
  //       '---call stream',
  //       nowTimestamp,
  //       signParams?.account,
  //       tokenId,
  //       req.headers.range,
  //       start,
  //       end,
  //       fileSize,
  //     );
  //     const file = fs.createReadStream(videoPath, { start, end });
  //     const header = {
  //       'Content-Range': `bytes ${start}-${end}/${fileSize}`,
  //       'Accept-Ranges': 'bytes',
  //       'Content-Length': chunksize,
  //       'Content-Type': 'video/mp4',
  //     };

  //     res.writeHead(206, header);
  //     file.pipe(res);
  //     let filter:any = { tokenId, exitedAt: { $gt: new Date(nowTimestamp - config.extraPeriodForHistory) } };
  //     if (userAddress && isAddress(userAddress)) {
  //       filter = { ...filter, watcherAddress: userAddress };
  //       await WatchHistoryModel.updateOne(
  //         filter,
  //         { exitedAt: new Date(nowTimestamp), lastWatchedFrame: end },
  //         overrideOptions,
  //       );
  //     }
  //   } else return res.status(500).send('No video range');
  // }

  async getImage (req:Request, res:Response) {
    const id = req.params.id;
    const width = Number(reqParam(req, 'w') || 450);
    if (!id) return res.status(400).json({ error: 'Bad Request: Id is required' });
    const tokenItem = await TokenModel.findOne({ tokenId: parseInt(id) }, { tokenId: 1, imageExt: 1 }).lean();
    if (tokenItem) {
      const imageLocalFilePath = defaultImageFilePath(parseInt(id), tokenItem.imageExt);

      // Will have to compress all the images on server later and make sure it gets compressed before it gets stored
      const compressedImage:any = await sharp(imageLocalFilePath).resize({ width }).toBuffer();

      res.set('Content-Type', 'image/png');
      res.set('Content-Length', compressedImage.length);
      // const sizeInMegabytes = compressedImage.length / (1024 * 1024);
      // console.log(`${sizeInMegabytes.toFixed(2)} MB`);

      return res.send(compressedImage);
      // return res.sendFile(imageLocalFilePath);
    }
    return res.status(404).json({ error: 'Token not found' });
  }
  async getMetaData (req:Request, res:Response) {
    const tokenId = req.params.id;
    if (!tokenId) return res.status(400).json({ error: 'Bad Request: tokenId is required' });
    const tokenTemplate = {
      name: 1,
      description: 1,
      tokenId: 1,
      imageUrl: 1,
      isHidden:  1,
      videoUrl: 1,
      owner: 1,
      minter: 1,
      streamInfo: 1,
      type: 1,
      _id: 0,
    };
    const filter = { tokenId: parseInt(tokenId) };
    const tokenItem = await TokenModel.findOne(filter, tokenTemplate).lean();
    if (!tokenItem) return JSON.stringify({});
    JSON.parse(JSON.stringify(nftMetaDataTemplate));
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
  }

  async getCover(req:Request, res:Response)  {
    const addressWithExt = req.params?.id;
    const width = Number(reqParam(req, 'w') || 1200);
    if (!addressWithExt || addressWithExt.split('.')?.length < 1) return res.json({ error: true });
    const imageExt = addressWithExt.split('.').pop();
    const address = addressWithExt.substring(0, addressWithExt.length - imageExt.length - 1);
    if (!isAddress(address)) return res.json({ error: true });
    const coverImagePath = `${process.env.CDN_BASE_URL}covers/${address}.${imageExt}`;

    const compressedImage:any = await sharp(coverImagePath).resize({ width, height: 300, fit: 'cover' }).toBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Content-Length', compressedImage.length);
  
    //   const sizeInMegabytes = compressedImage.length / (1024 * 1024);
    //   console.log(`${sizeInMegabytes.toFixed(2)} MB`);
  
    return res.send(compressedImage);
    //   return res.sendFile(coverImagePath);
  }

  async getAvatar(req:Request, res:Response){
    const addressWithExt = req.params?.id;
    const width = Number(reqParam(req, 'w') || 50);
    if (!addressWithExt || addressWithExt.split('.')?.length < 1) return res.json({ error: true });
    const imageExt = addressWithExt.split('.').pop();
    const address = addressWithExt.substring(0, addressWithExt.length - imageExt.length - 1);
    if (!isAddress(address)) return res.json({ error: true });
    const avatarImagePath = `${process.env.CDN_URL}/${address.toLowerCase()}/avatar.${imageExt}`;
    const compressedImage:any = await sharp(avatarImagePath).resize({ width: width, fit: 'cover' }).toBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Content-Length', compressedImage.length);
  
    //   const sizeInMegabytes = compressedImage.length / (1024 * 1024);
    //   console.log(`${sizeInMegabytes.toFixed(2)} MB`);
  
    return res.send(compressedImage);
    // return res.sendFile(avatarImagePath);
  }

  async handleImageUpload(files: Express.Multer.File[]): Promise<{ message: string; urls: string[] }> {
    const imageLinks = [];

    for (const image of files) {
      try {
        // Upload the image to your CDN
        const imagePath =await this.cdnService.uploadFile(image.buffer, 'chatsassset', image.originalname); 
        
        // Push the CDN URL to imageLinks
        imageLinks.push(imagePath);
      } catch (error) {
        console.error('Error uploading image:', error);
        throw new InternalServerErrorException('Error uploading images');
      }
    }

    return {
      message: 'Images uploaded successfully',
      urls: imageLinks,
    };
  }
}
