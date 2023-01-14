require("dotenv").config();
const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");

const { isValidAccount } = require("../utils/auth");
const { vaultContractAddresses, ChainId, supportedTokens, streamInfoKeys, RewardType } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { Token } = require("../models/Token");
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { normalizeAddress } = require("../utils/format");
const { getERC20TokenBalance } = require("../utils/web3");
const { PPVTransaction } = require("../models/PPVTransaction");
const { config } = require("../config");
const { Reward } = require("../models/Reward");

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
    await Balance.updateOne({ address: account.toLowerCase(), chainId, tokenAddress }, { walletBalance: tokenBalance, updateWalletBalanceAt: new Date() });
}

const requestPPVStream = async (account, sig, timestamp, chainId, tokenId) => {
    if (!account || !sig || !timestamp || !chainId) return { result: false, error: 'Please connect with your wallet' };
    if (!isValidAccount(account, timestamp, sig)) return { result: false, error: 'Please sign with your wallet' };
    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem || !nftStreamItem.streamInfo?.[streamInfoKeys.isPayPerView]) return { result: false, error: 'This stream is not locked with ppv' };
    const streamInfo = nftStreamItem.streamInfo;
    if (!(streamInfo[streamInfoKeys.payPerViewChainIds] || [config.defaultChainId])?.includes(chainId)) return { result: false, error: 'Not supported chain' };
    const tokenItem = supportedTokens.find(e => e.symbol === (streamInfo[streamInfoKeys.payPerViewTokenSymbol] || config.defaultTokenSymbol) && e.chainId === chainId);

    const ppvTxItem = await PPVTransaction.findOne({ address: normalizeAddress(account), streamTokenId: tokenId, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } });
    if (ppvTxItem) return { result: false, error: 'Already paid' };
    const payAmount = streamInfo[streamInfoKeys.payPerViewAmount];
    const balanceItem = await Balance.findOne(
        {
            address: normalizeAddress(account),
            tokenAddress: normalizeAddress(tokenItem.address),
            chainId,
        },
        { balance: 1 }
    )
    if (!balanceItem?.balance || balanceItem.balance < payAmount) return { result: false, error: 'The user have no enough balance' };
    await Balance.updateOne({ address: normalizeAddress(account), tokenAddress: normalizeAddress(tokenItem.address), chainId }, { $inc: { balance: -payAmount, paidForPPV: payAmount } });
    const reward = payAmount * (1 - config.developerFee);
    if (nftStreamItem.owner) {
        await Balance.updateOne({ address: nftStreamItem.owner, tokenAddress: normalizeAddress(tokenItem.address), chainId }, { $inc: { balance: reward, reward } });
        await Reward.create({ address: nftStreamItem.owner, rewardAmount: reward, tokenId, from: normalizeAddress(account), chainId, type: RewardType.PayPerView });
        await Token.updateOne({ tokenId }, { $inc: { totalFunds: reward } });
    }
    await PPVTransaction.create({ address: account, amount: payAmount, streamTokenId: tokenId, tokenAddress: normalizeAddress(tokenItem.address), chainId });
    return { result: true };
}

module.exports = {
    signatureForClaim,
    updateWalletBalance,
    requestPPVStream,
};
