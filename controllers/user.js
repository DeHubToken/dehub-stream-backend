require("dotenv").config();
const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");
const { Collection } = require("../models/Collection");
const { Token } = require("../models/Token");
const { moveFile } = require("../utils/file");
const { isValidAccount } = require("../utils/auth");
const { Account } = require("../models/Account");
const { vaultContractAddresses, ChainId } = require("../config/constants");

const signer = new ethers.Wallet(process.env.SIGNER_KEY);

const signatureForClaim = async (address, sig, timestamp, amount) => {

    if (!sig || !address || !timestamp || !amount || isNaN(amount))
        return { error: true, msg: "sig or parameters not exist" };
    // const result = await isValidAccount(address, timestamp, rawSig);
    // if (!result) return { status: false, error: true, error_msg: "should login first" };
    // else {
    const filterAccountOption = { address: address.toLowerCase() };
    const accountInfo = await Account.findOne(filterAccountOption, { balance: 1 });
    if (!accountInfo || accountInfo?.balance < Number(amount))
        return { status: false, error: true, error_msg: "insufficient balance" };
    // }
    const curTimestamp = Math.floor(Date.now() / 1000);
    let bigAmount = undefined;
    try {
        bigAmount = ethers.utils.parseUnits(amount.toString(), 18);
    }
    catch (e) {
        console.log("--", e);
        return { error: true, msg: "amount error" };
    }

    const toSignForClaim = ethers.utils.solidityKeccak256(["address", "address", "uint256", "uint256"], [vaultContractAddresses[ChainId.BSC_TESTNET], address, bigAmount, curTimestamp]);
    let signer = new ethers.Wallet(process.env.SIGNER_KEY);
    const { r, s, v } = splitSignature(await signer.signMessage(ethers.utils.arrayify(toSignForClaim)));
    await Account.updateOne(filterAccountOption, { $inc: { balance: -Number(amount), pendingBalance: Number(amount) } });
    return { status: true, result: { amount: bigAmount.toString(), timestamp: curTimestamp, v, r, s } };
};

module.exports = {
    signatureForClaim,
};
