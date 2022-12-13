require('dotenv').config();
const ethers = require('ethers');
const { Account } = require("../models/Account");
const { config } = require("../config");

const expireSecond = 60 * 60 * 2; // 2 hours
/**
 * if user signature and timestamp is correct, returns account data, if not => false
 * @param {*} address 
 * @param {*} timestamp 
 * @param {*} sig 
 * @returns 
 */
const isValidAccount = async (address, timestamp, sig) => {
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
        console.log(nowTime - expireSecond - Number(timestamp),signedAddress.toLowerCase() != address.toLowerCase());
        if ((nowTime - expireSecond > Number(timestamp) || signedAddress.toLowerCase() != address.toLowerCase()) && !config.isDevMode) return false;
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
module.exports = {
    isValidAccount,
    reqParam,
}