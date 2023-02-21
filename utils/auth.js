require('dotenv').config();
const ethers = require('ethers');
const { Account } = require("../models/Account");
const { config } = require("../config");
const { paramNames } = require('../config/constants');

const expireSecond = config.isDevMode ? 60 * 60 * 2 : 60 * 60 * 24; // 2 hours for dev mode, 24 hours for production mode
/**
 * if user signature and timestamp is correct, returns account data, if not => false
 * @param {*} address 
 * @param {*} timestamp 
 * @param {*} sig 
 * @returns 
 */
const isValidAccount = (address, timestamp, sig) => {
    if (!sig || !address || !timestamp)
        return false;
    const signedMsg = `${address.toLowerCase()}-${timestamp}`;
    try {
        const signedAddress = ethers.utils
            .verifyMessage(signedMsg, sig)
            .toLowerCase();
        /** 
         * in case of development mode, we don't check signature and timestamp
         */
        const nowTime = Math.floor(Date.now() / 1000);
        // console.log(nowTime - expireSecond - Number(timestamp),signedAddress.toLowerCase() != address.toLowerCase());
        if ((nowTime - expireSecond > Number(timestamp) || signedAddress.toLowerCase() != address.toLowerCase()) /* && !config.isDevMode */) return false;
        return true;
        // const accountItem = await Account.findOne({ address: address.toLowerCase() }).lean();
        // if (!config.isDevMode && accountItem && timestamp - accountItem.lastLoginTimestamp < config.expireSigninTime)
        //     accountItem;
        // else return false;
    }
    catch (e) {
        console.log('check account:', e);
        return false;
    }
    return false;
}

const reqParam = (req, paramName) => {
    if (!req) return null;
    return req.query?.[paramName] || req.body?.[paramName] || req.params?.[paramName];
}

/**
 * call as middleware before main api function is called
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns call next function if api call is authorized with signed params
 */
const isAuthorized = async (req, res, next) => {
    const address = reqParam(req, paramNames.address);
    const rawSig = reqParam(req, paramNames.sig);
    const timestamp = reqParam(req, paramNames.timestamp);
    if (!rawSig || !address || !timestamp)
        return res.json({ error: true, msg: "sig or address not exist" });
    const result = isValidAccount(address, timestamp, rawSig);
    if (!result) return res.json({ status: false, error: true, error_msg: "should sign with your wallet first" });
    return next();
}

module.exports = {
    isValidAccount,
    reqParam,
    isAuthorized
}