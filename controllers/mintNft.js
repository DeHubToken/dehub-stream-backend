require("dotenv").config();
const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");
const { Collection } = require("../models/Collection");
const { Token } = require("../models/Token");
const { moveFile } = require("../utils/file");
const { streamInfoKeys, supportedTokens, overrideOptions, streamCollectionAddresses } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { normalizeAddress } = require("../utils/format");
const { getTotalBountyAmount } = require("../utils/calc");
const { config } = require("../config");
const { removeDuplicatedElementsFromArray, isUserCanAddNewCategory } = require("../utils/validation");
const { Category } = require("../models/Category");

const signer = new ethers.Wallet(process.env.SIGNER_KEY);

const signatureForMintingNFT = async (videoFile, imageFile, name, description, streamInfo, address, chainId, category) => {

  const collectionAddress = normalizeAddress(streamCollectionAddresses[chainId]);
  address = normalizeAddress(address);
  let videoExt = videoFile.mimetype.toString().substr(videoFile.mimetype.toString().indexOf("/") + 1);
  if (videoExt === 'quicktime') videoExt = 'mov';
  const imageExt = imageFile.mimetype.toString().substr(imageFile.mimetype.toString().indexOf("/") + 1);
  // checking category
  if (category?.length > 0) {
    category = removeDuplicatedElementsFromArray(category);
    const categoryItems = await Category.find({ name: { $in: category } }).distinct('name');
    if (categoryItems.length < category.length) {
      if (await isUserCanAddNewCategory(address)) {
        // if contains new category, add new category
        const newCategories = category.filter(uploadedCategory => !categoryItems.find(e => e == uploadedCategory));
        if (newCategories?.length > 0) {
          await Category.insertMany(newCategories.map(e => { return { name: e }; }))
        }
      }
      else {
        return { error: true, msg: "Increase badge to upload a stream with new category" };
      }
    }
  }
  const addedOptions = {};
  // 1. store lock for bounty 
  if (streamInfo[streamInfoKeys.isAddBounty]) {
    const precision = 5;
    const bountyAmount = Math.round(streamInfo[streamInfoKeys.addBountyAmount] * 10 ** precision) / (10 ** precision);
    streamInfo[streamInfoKeys.addBountyAmount] = bountyAmount;
    addedOptions['lockedBounty'] = {
      viewer: streamInfo[streamInfoKeys.addBountyAmount] * streamInfo[streamInfoKeys.addBountyFirstXViewers],
      commentor: streamInfo[streamInfoKeys.addBountyAmount] * streamInfo[streamInfoKeys.addBountyFirstXComments],
    };
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
    chainId,
    category,
    minter: normalizeAddress(address),
    ...addedOptions
  });
  // 3. move file to main assets directory  
  const videoPath = `${path.dirname(__dirname)}/assets/videos/${tokenItem.tokenId}.${videoExt}`;  
  moveFile(`${path.dirname(__dirname)}/${videoFile.path}`, videoPath);
  const imagePath = `${path.dirname(__dirname)}/assets/images/${tokenItem.tokenId}.${imageExt}`;  
  moveFile(`${path.dirname(__dirname)}/${imageFile.path}`, imagePath);

  // 4. signature for minting token
  const totalSupply = 1000;
  const messageHash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256"],
    [collectionAddress, tokenItem.tokenId, chainId, totalSupply, timestamp]
  );
  const { r, s, v } = splitSignature(
    await signer.signMessage(ethers.utils.arrayify(messageHash))
  );
  return { r, s, v, createdTokenId: tokenItem.tokenId, timestamp };
};

module.exports = {
  signatureForMintingNFT,
};
