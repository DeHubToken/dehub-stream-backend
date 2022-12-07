require("dotenv").config();
const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");
const { Collection } = require("../models/Collection");
const { Token } = require("../models/Token");
const { moveFile } = require("../utils/file");

const signer = new ethers.Wallet(process.env.SIGNER_KEY);

const signatureForMintingNFT = async (videoFile, imageFile, name, description, streamInfo) => {
  const collectionAddress = process.env.DEFAULT_COLLECTION?.toLowerCase();

  // 1. create pending token
  const timestamp = Math.floor(Date.now() / 1000);
  const tokenItem = await Token.create({
    contractAddress: collectionAddress,
    name,
    description,
    streamInfo
  });
  // 2. move file to main assets directory  
  const videoExt = videoFile.mimetype.toString().substr(videoFile.mimetype.toString().indexOf("/") + 1);
  const videoPath = `${path.dirname(__dirname)}/assets/videos/${tokenItem.tokenId}.${videoExt}`;
  console.log('-----video path', videoPath);
  moveFile(`${path.dirname(__dirname)}/${videoFile.path}`, videoPath);

  const imageExt = imageFile.mimetype.toString().substr(imageFile.mimetype.toString().indexOf("/") + 1);
  const imagePath = `${path.dirname(__dirname)}/assets/images/${tokenItem.tokenId}.${imageExt}`;
  console.log('-----image path', imagePath);
  moveFile(`${path.dirname(__dirname)}/${imageFile.path}`, imagePath);

  // 3. signature for minting token
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
