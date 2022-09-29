const { Account } = require("../models/Account");
const ethers = require('ethers');
require('dotenv').config();
const isValidAccount = async (address, timestamp, sig) => {
    if (!sig || !address || !timestamp)
        return false;
    const signedMsg = `${address.toLowerCase()}-${timestamp}`;
    try {        
        const signedAddress = ethers.utils
            .verifyMessage(signedMsg, sig)
            .toLowerCase();
        // console.log("---user sign", signedAddress);
        if (signedAddress != address && process.env.RUN_MODE!="dev") return false;
        const accountItem = await Account.findOne({address}).lean();
        if(accountItem) return accountItem;
        else return false;
    }
    catch(e)
    {
        console.log(e);
        return false;
    }
    return false;
}

const reqParam = (req, paramName) => {    
    if(!req) return null;
    return req.query?.[paramName] || req.body?.[paramName] || req.params?.[paramName];
}
module.exports = {
    isValidAccount,
    reqParam,
}