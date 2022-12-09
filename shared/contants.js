require('dotenv').config
const MAX_MINT = process.env.RUN_MODE == 'dev' ? 100 : 3;
const NFT_NAME_PREFIX = "Stream NFT";
const EXPIRED_TIME_FOR_MINTING = 60000 * 2; //ms

module.exports = {
  MAX_MINT,
  NFT_NAME_PREFIX,
  EXPIRED_TIME_FOR_MINTING,  
};
