require("dotenv").config();
const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");
const { Collection } = require("../models/Collection");
const { Token } = require("../models/Token");
const { moveFile } = require("../utils/file");
const { streamInfoKeys, supportedTokens, overrideOptions } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { normalizeAddress } = require("../utils/format");
const { getTotalBountyAmount } = require("../utils/calc");
const { config } = require("../config");

const signer = new ethers.Wallet(process.env.SIGNER_KEY);

const signatureForMintingNFT = async (videoFile, imageFile, name, description, streamInfo, address) => {
  const collectionAddress = process.env.DEFAULT_COLLECTION?.toLowerCase();
  const videoExt = videoFile.mimetype.toString().substr(videoFile.mimetype.toString().indexOf("/") + 1);
  const imageExt = imageFile.mimetype.toString().substr(imageFile.mimetype.toString().indexOf("/") + 1);

  // 1. check balance and lock for bounty 
  if (streamInfo[streamInfoKeys.isAddBounty]) {
    const addBountyTotalAmount = getTotalBountyAmount(streamInfo);
    const bountyAmountWithFee = getTotalBountyAmount(streamInfo, true);
    const bountyToken = supportedTokens.find(e => e.symbol === streamInfo[streamInfoKeys.addBountyTokenSymbol] && e.chainId === Number(streamInfo[streamInfoKeys.addBountyChainId]));
    const balanceFilter = { address: normalizeAddress(address), tokenAddress: bountyToken?.address?.toLowerCase(), chainId: Number(streamInfo[streamInfoKeys.addBountyChainId]) };
    const balanceItem = await Balance.findOne(balanceFilter).lean();
    if (balanceItem.balance < bountyAmountWithFee) return { result: false, error: 'insufficient balance to add bounty' };
    const updatedBalanceItem = await Balance.findOneAndUpdate(balanceFilter, { $inc: { balance: -bountyAmountWithFee, lockForBounty: addBountyTotalAmount } }, { returnOriginal: false });
    if (updatedBalanceItem?.balance < 0) return { result: false, error: 'insufficient balance to add bounty' };
    await Balance.updateOne({ ...balanceFilter, address: config.devWalletAddress }, { $inc: { balance: bountyAmountWithFee - addBountyTotalAmount } }, overrideOptions);
  }
  // 2. create pending token
  const timestamp = Math.floor(Date.now() / 1000);
  const tokenItem = await Token.create({
    contractAddress: collectionAddress,
    name,
    description,
    streamInfo,
    videoExt,
    imageExt,
    minter: normalizeAddress(address)
  });
  // 3. move file to main assets directory  
  const videoPath = `${path.dirname(__dirname)}/assets/videos/${tokenItem.tokenId}.${videoExt}`;
  console.log('-----video path', videoPath);
  moveFile(`${path.dirname(__dirname)}/${videoFile.path}`, videoPath);

  const imagePath = `${path.dirname(__dirname)}/assets/images/${tokenItem.tokenId}.${imageExt}`;
  console.log('-----image path', imagePath);
  moveFile(`${path.dirname(__dirname)}/${imageFile.path}`, imagePath);

  // 4. signature for minting token
  const mintCount = 1;
  const messageHash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256"],
    [collectionAddress, tokenItem.tokenId, mintCount, timestamp]
  );
  const { r, s, v } = splitSignature(
    await signer.signMessage(ethers.utils.arrayify(messageHash))
  );
  return { r, s, v, createdTokenId: tokenItem.tokenId, timestamp };
};

module.exports = {
  signatureForMintingNFT,
};
