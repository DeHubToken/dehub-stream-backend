let BaseController = require('./BaseController');
const { Account } = require('../models/Account');
const path = require("path");
const fs = require('fs');
require("dotenv").config();
const { ethers } = require('ethers');
const { splitSignature } = require('@ethersproject/bytes');
const { isValidAccount, reqParam } = require('../utils/auth');
const { decryptWithSourceKey, encryptWithSourceKey } = require('../utils/encrypt');

const config = require('../config')();
const expireTime = 86400000;
module.exports = BaseController.extend({
    name: 'ApiController',
    api_acount: async function (req, res, next) {
        return res.json({});
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
        if (Number(timestamp)<Date.now()-expireTime)
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
        if (Number(timestamp)<Date.now()-expireTime)
            return res.json({ error: true, msg: "expired!" });
        const result = await isValidAccount(address, timestamp, rawSig);
        if (!result) return res.json({ status: false, error: true, error_msg: "should login first" });
        const data = { u: result.username, e: result.email };
        // const encrypted = encryptWithSourceKey(JSON.stringify(data), rawSig);
        const data1 = encryptWithSourceKey(result.username, rawSig);
        const data2 = encryptWithSourceKey(result.email, rawSig);
        return res.json({ status: true, result: { data1, data2 } });
    }
});