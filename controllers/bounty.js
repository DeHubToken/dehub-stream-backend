require("dotenv").config();
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");
const { streamControllerContractAddresses } = require("../config/constants");
const { Token } = require("../models/Token");
const { config } = require("../config");

// const signer = new ethers.Wallet(process.env.SIGNER_KEY);

/**
 * 
 * @param {*} address 
 * @param {*} tokenId 
 * @param {*} bountyType 
 * @returns signatures to claim bounty 
 */
const signatureForClaimBounty = async (address, tokenId, bountyType) => {
    console.log('------sig for bounty', address, tokenId, bountyType);
    const tokenItem = await Token.findOne({ tokenId }, { chainId: 1, streamInfo: 1 }).lean();
    const chainId = tokenItem?.chainId || config.defaultChainId;
    const toSignForClaim = ethers.utils.solidityKeccak256(["address", "address", "uint256", "uint256", "uint8"],
        [streamControllerContractAddresses[chainId], address, chainId, tokenId, bountyType]);
    let signer = new ethers.Wallet(process.env.SIGNER_KEY);
    const { r, s, v } = splitSignature(await signer.signMessage(ethers.utils.arrayify(toSignForClaim)));
    return { v, r, s }
};


module.exports = {
    signatureForClaimBounty,
}