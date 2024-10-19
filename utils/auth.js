require('dotenv').config();
const ethers = require('ethers');
const { Account } = require('../models/Account');
const { config } = require('../config');
const { paramNames } = require('../config/constants');
const jwt = require('jsonwebtoken');
const secretKey = 'your_secret_key';

/*
  Move to using jwt auth that holds the signature, timestamp and address
  But still allow the normal sending the sig, timestamp and address payload until frontend fully transitions
  
    */
// const expireSecond = config.isDevMode ? 60 * 60 * 2 : 60 * 60 * 24; // 2 hours for dev mode, 24 hours for production mode
const expireSecond = config.isDevMode ? 60 * 60 * 24 : 60 * 60 * 24; // 2 hours for dev mode, 24 hours for production mode
/**
 * if user signature and timestamp is correct, returns account data, if not => false
 * @param {*} address
 * @param {*} timestamp
 * @param {*} sig
 * @returns
 */
const isValidAccount = (address, timestamp, sig) => {
  if (!sig || !address || !timestamp) return false;
  // const signedMsg = `${address.toLowerCase()}-${timestamp}`;
  const displayedDate = new Date(timestamp * 1000);
  const signedMsg = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for ${expireSecond / 3600} hours.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;
  // const signedMsg = `Welcome to Blocjerk!\n\nClick to sign in for authentication.\nSignatures are valid for ${expireSecond / 3600} hours.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;
  try {
    const signedAddress = ethers.utils.verifyMessage(signedMsg, sig).toLowerCase();
    /**
     * in case of development mode, we don't check signature and timestamp
     */
    const nowTime = Math.floor(Date.now() / 1000);
    // console.log(nowTime - expireSecond - Number(timestamp),signedAddress.toLowerCase() != address.toLowerCase());
    if (
      nowTime - expireSecond > Number(timestamp) ||
      signedAddress.toLowerCase() != address.toLowerCase() /* && !config.isDevMode */
    )
      return false;
    return true;
  } catch (e) {
    console.log('check account:', e);
    return false;
  }
  return false;
};

const generateToken = (address, rawSig, timestamp) => {
  if (!address || !rawSig || !timestamp) return null;
  return jwt.sign({ address, rawSig, timestamp }, secretKey, { expiresIn: '3d' });
};

const reqParam = (req, paramName) => {
  if (!req) return null;
  const result = req.query?.[paramName] || req.body?.[paramName] || req.params?.[paramName];
  return typeof result === 'string' ? result?.trim() : result;
};

/**
 * call as middleware before main api function is called
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns call next function if api call is authorized with signed params
 */
const isAuthorized = async (req, res, next) => {
  const token = req.headers?.authorization?.split(' ')[1];

  if (token) {
    try {
      const decodedToken = jwt.verify(token, secretKey);
      req.params.address = decodedToken.address.toLowerCase();
      req.params.rawSig = decodedToken.rawSig;
      req.params.timestamp = decodedToken.timestamp;
      next();
    } catch (error) {
      return res.status(401).json({ error: true, msg: 'Invalid authorization token' });
    }
  } else {
    const address = reqParam(req, paramNames.address);
    const rawSig = reqParam(req, paramNames.sig);
    const timestamp = reqParam(req, paramNames.timestamp);

    if (!rawSig || !address || !timestamp) {
      return res.json({ error: true, msg: 'sig or address not exist' });
    }

    req.params.address = address.toLowerCase();
    req.params.rawSig = rawSig;
    req.params.timestamp = timestamp;

    const token = generateToken(address, rawSig, timestamp);
    req.generatedToken = token;
    next();
  }
};

module.exports = {
  isValidAccount,
  reqParam,
  isAuthorized,
};
