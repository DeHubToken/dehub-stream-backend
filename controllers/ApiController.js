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
const expireTime = 86400000;
const ApiController = {
    getServerTime: async function (req, res, next) {
        return res.json({ status: true, data: Math.floor(Date.now() / 1000), note: 's' });
    },
    signWithWallet: async function (req, res, next) {
        const address = reqParam(req, paramNames.address);
        const rawSig = reqParam(req, paramNames.sig);
        const timestamp = reqParam(req, paramNames.timestamp);
        if (!rawSig || !address || !timestamp)
            return res.json({ error: true, msg: "sig or address not exist" });
        const signedMsg = `${address.toLowerCase()}-${timestamp}`;
        console.log("---signed msg", signedMsg, rawSig);
        // const toSign = ethers.utils
        //     .keccak256(
        //         ethers.utils.defaultAbiCoder.encode(["string"], [signedMsg])
        //     )
        //     .slice(2);
        try {
            const signedAddress = ethers.utils
                .verifyMessage(signedMsg, rawSig)
                .toLowerCase();
            console.log("---user sign", signedAddress);
            if (signedAddress != address) return res.json({ status: false, error: true, error_msg: "sign error" });
            const account = await Account.findOneAndUpdate({ address: signedAddress }, { loginDate: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (!account) return res.json({ status: false, error: true, error_msg: "not found account" });
            console.log(account);
            return res.json({ status: true, result: { address: signedAddress, loginDate: account.loginDate } });
        } catch (e) {
            console.log("signature error", e);
            return res.json({ error: true, msg: "sign error" });
        }
    },
    registerUserInfo: async function (req, res, next) {
        const address = req.query.address || req.body.address || req.params.address;
        const rawSig = req.query.sig || req.body.sig || req.params.sig;
        const timestamp = req.query.timestamp || req.body.timestamp || req.params.timestamp;
        const data = reqParam(req, "data");
        const encryptedUsername = reqParam(req, "data1");
        const encryptedEmail = reqParam(req, "data2");
        // const username = req.query.username || req.body.username || req.params.username;        
        if (!rawSig || !address || !timestamp || !encryptedUsername || !encryptedEmail)
            return res.json({ error: true, msg: "sig or address not exist" });
        if (Number(timestamp) < Date.now() - expireTime)
            return res.json({ error: true, msg: "expired!" });
        let signedMsg = `${address.toLowerCase()}-${timestamp}`;
        console.log("---signed msg", signedMsg, rawSig);
        try {
            // signedMsg = ethers.utils
            // .keccak256(
            //   ethers.utils.defaultAbiCoder.encode(["string"], [signedMsg])
            // )
            // .slice(2);
            const signedAddress = ethers.utils
                .verifyMessage(signedMsg, rawSig)
                .toLowerCase();
            console.log("---user sign", signedAddress);
            if (signedAddress.toLowerCase() != address.toLowerCase()) return res.json({ status: false, error: true, error_msg: "sign error" });
            const username = decryptWithSourceKey(encryptedUsername, rawSig);
            const email = decryptWithSourceKey(encryptedEmail, rawSig);

            // let decryptedData;
            if (!username || !email)
                return res.json({ error: true, msg: "username or email not exist" });
            // try {
            //     decryptedData = JSON.parse(decrypted);
            // }
            // catch
            // {
            //     return res.json({ error: true, msg: "sig or address not exist" });
            // }

            const account = await Account.findOneAndUpdate({ address: signedAddress }, { username, email, loginDate: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (!account) return res.json({ status: false, error: true, error_msg: "not found account" });
            console.log(account);
            return res.json({ status: true, result: { address: signedAddress, loginDate: account.loginDate } });
        } catch (e) {
            console.log("signature error", e);
            return res.json({ error: true, msg: "sign error" });
        }
    },
    getUserInfo: async function (req, res, next) {
        const address = reqParam(req, "address");
        const rawSig = reqParam(req, "sig");
        const timestamp = reqParam(req, "timestamp");

        if (!rawSig || !address || !timestamp)
            return res.json({ error: true, msg: "sig or parameters not exist" });
        if (Number(timestamp) < Date.now() - expireTime)
            return res.json({ error: true, msg: "expired!" });
        const result = await isValidAccount(address, timestamp, rawSig);
        if (!result) return res.json({ status: false, error: true, error_msg: "should login first" });
        const data = { u: result.username, e: result.email };
        // const encrypted = encryptWithSourceKey(JSON.stringify(data), rawSig);
        const data1 = encryptWithSourceKey(result.username, rawSig);
        const data2 = encryptWithSourceKey(result.email, rawSig);
        return res.json({ status: true, result: { data1, data2 } });
    },
    getSignedDataForUserMint: async function (req, res, next) {

        const { from, name, description, } = req.body;
        const uploadedFiles = req.files.files;
        if (uploadedFiles?.length < 2) return res.json({ error: true, msg: "upload image and video file" });
        const videoFile = uploadedFiles[0];
        if (!checkFileType(videoFile)) return res.json({ error: true, msg: errorMsgs.not_supported_video });
        const imageFile = uploadedFiles[1];
        if (!checkFileType(imageFile, 'image')) return res.json({ error: true, msg: errorMsgs.not_supported_image });
        
        const result = await signatureForMintingNFT(videoFile, imageFile, name, description);
        return res.json(result);
    },
    getAllNfts: async function (req, res, next) {
        const skip = req.body.skip || req.query.skip || 0;
        const limit = req.body.limit || req.query.limit || 1000;
        const filter = { $or: [{ status: "minted" }, { status: null }] };
        const tokenTemplate = {
            name: 1,
            description: 1,
            tokenId: 1,
            imageUrl: 1,
            videoUrl: 1,
            owner: 1,
            minter: 1,
            _id: 0,
        };
        const totalCount = await Token.find(filter, tokenTemplate).count();
        const all = await Token.find(filter, tokenTemplate)
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        return res.json({ result: { items: all, totalCount, skip, limit } });
    }
}
module.exports = { ApiController };