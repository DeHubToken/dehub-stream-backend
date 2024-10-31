// imports.ts
import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { ethers, solidityPackedKeccak256 } from 'ethers';
import { arrayify, splitSignature } from '@ethersproject/bytes';
import { CdnService } from '../cdn/cdn.service';
import { TokenDocument, TokenModel } from 'models/Token';
import { normalizeAddress } from 'common/util/format';
import { paramNames, streamCollectionAddresses, streamInfoKeys, tokenTemplate } from 'config/constants';
import { eligibleBountyForAccount, isValidSearch, removeDuplicatedElementsFromArray } from 'common/util/validation';
import { CategoryModel } from 'models/Category';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { config } from 'config';
import { reqParam } from 'common/util/auth';
import { WatchHistoryModel } from 'models/WatchHistory';
import { CommentModel } from 'models/Comment';
import { PPVTransactionModel } from 'models/PPVTransaction';
import { LikedVideos } from 'models/LikedVideos';
import { streamControllerContractAddresses } from "config/constants";
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import { defaultVideoFilePath } from 'common/util/file';
import { statSync } from 'fs';
import { JobService } from 'src/job/job.service';
import { VoteModel } from 'models/Vote';
import sharp from 'sharp';

const signer = new ethers.Wallet(process.env.SIGNER_KEY || '');

export {
    mongoose, ethers, solidityPackedKeccak256, arrayify, splitSignature,
    CdnService, TokenModel, normalizeAddress, paramNames, streamCollectionAddresses,
    streamInfoKeys, tokenTemplate, eligibleBountyForAccount, isValidSearch,
    removeDuplicatedElementsFromArray, CategoryModel, Request, Response, AccountModel,
    config, reqParam, WatchHistoryModel, CommentModel, PPVTransactionModel, LikedVideos,
    streamControllerContractAddresses, ffprobe, ffprobeStatic, defaultVideoFilePath,
    statSync, JobService, VoteModel, sharp, signer
};
