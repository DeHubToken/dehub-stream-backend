require("dotenv").config();
const { Collection } = require("../models/Collection");
const { Token } = require("../models/Token");
const { MAX_MINT } = require("../shared/contants");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");

const signer = new ethers.Wallet(process.env.SIGNER_KEY);

const mintNft = async (minter, mintCount) => {
  const collectionAddress = process.env.DEFAULT_COLLECTION?.toLowerCase();
  const mintedCount = await Token.find({ minter }).count();
  if (mintCount + mintedCount > MAX_MINT)
    return { error: true, msg: "Max mint is over" };
  let createdTokenIds = [];
  const timestamp = Math.floor(Date.now() / 1000);
  for (let i = 0; i < mintCount; i++) {
    const tokenItem = await Token.create({
      minter,
      contractAddress: collectionAddress,
    });
    createdTokenIds.push(tokenItem.tokenId);
  }

  const messageHash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256"],
    [collectionAddress, createdTokenIds[0], mintCount, timestamp]
  );
  const { r, s, v } = splitSignature(
    await signer.signMessage(ethers.utils.arrayify(messageHash))
  );

  return { r, s, v, createdTokenIds, mintCount, timestamp };
};

module.exports = {
  mintNft,
};
