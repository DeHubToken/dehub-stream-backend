require("dotenv").config();
const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");

const { isValidAccount } = require("../utils/auth");
const { vaultContractAddresses, ChainId, supportedTokens } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { normalizeAddress } = require("../utils/format");
const { getERC20TokenBalance } = require("../utils/web3");

const signer = new ethers.Wallet(process.env.SIGNER_KEY);

const signatureForClaim = async (address, sig, timestamp, amount, chainId, tokenAddress) => {

    if (!sig || !address || !timestamp || !amount || isNaN(amount))
        return { error: true, msg: "sig or parameters not exist" };
    console.log('------', address, sig, amount, chainId, tokenAddress)
    const result = isValidAccount(address, timestamp, sig);
    if (!result) return { status: false, error: true, error_msg: "should login first" };
    // else {
    const filterBalanceOption = { address: address.toLowerCase(), tokenAddress: tokenAddress?.toLowerCase(), chainId };
    // const accountInfo = await Account.findOne(filterAccountOption, { balance: 1 });
    const balanceData = await Balance.findOne(filterBalanceOption, { balance: 1 });
    if (!balanceData || balanceData?.balance < Number(amount))
        return { status: false, error: true, error_msg: "insufficient balance" };
    // }
    const curTimestamp = Math.floor(Date.now() / 1000);
    let bigAmount = undefined;
    try {
        bigAmount = ethers.utils.parseUnits(amount.toString(), supportedTokens.find(e => e.address.toLowerCase() === tokenAddress?.toLowerCase() && e.chainId === chainId).decimals);
    }
    catch (e) {
        console.log("--", e);
        return { error: true, msg: "amount error" };
    }
    const claimTx = await ClaimTransaction.create({
        receiverAddress: normalizeAddress(address),
        tokenAddress: normalizeAddress(tokenAddress),
        timestamp: curTimestamp,
        chainId: chainId,
        amount
    });
    const toSignForClaim = ethers.utils.solidityKeccak256(["address", "uint256", "address", "address", "uint256", "uint256", "uint256"],
        [vaultContractAddresses[chainId], claimTx.id, address, tokenAddress, chainId, bigAmount, curTimestamp]);
    let signer = new ethers.Wallet(process.env.SIGNER_KEY);
    const { r, s, v } = splitSignature(await signer.signMessage(ethers.utils.arrayify(toSignForClaim)));    
    await Balance.updateOne(filterBalanceOption, { $inc: { balance: -Number(amount), pending: Number(amount) } });
    return { status: true, result: { amount: bigAmount.toString(), timestamp: curTimestamp, id: claimTx.id, v, r, s } };
};

const updateWalletBalance = async (account, tokenAddress, chainId) => {
    const tokenBalance = await getERC20TokenBalance(account, tokenAddress, chainId);
    await Balance.updateOne({address: account.toLowerCase(), chainId, tokenAddress}, {walletBalance: tokenBalance, updateWalletBalanceAt: new Date()});
}

module.exports = {
    signatureForClaim,
    updateWalletBalance,
};
