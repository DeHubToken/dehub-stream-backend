require("dotenv").config();
// const path = require("path");
const { ethers } = require("ethers");
const { splitSignature } = require("@ethersproject/bytes");

const { isValidAccount } = require("../utils/auth");
const { vaultContractAddresses, ChainId, supportedTokens, streamInfoKeys, RewardType, overrideOptions } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { Token } = require("../models/Token");
const { ClaimTransaction } = require("../models/ClaimTransaction");
const { normalizeAddress } = require("../utils/format");
const { getERC20TokenBalance } = require("../utils/web3");
const { PPVTransaction } = require("../models/PPVTransaction");
const { config } = require("../config");
const { Reward } = require("../models/Reward");
const Feature = require("../models/Feature");
const Comment = require("../models/Comment");

// const signer = new ethers.Wallet(process.env.SIGNER_KEY);

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
    await Balance.updateOne({ address: normalizeAddress(account.toLowerCase()), chainId, tokenAddress: normalizeAddress(tokenAddress) }, { walletBalance: tokenBalance, updateWalletBalanceAt: new Date() });
}
/**
 * 
 * @param {*} tokenId 
 * @param {*} address address receives bounty
 * @param {*} type Viewer or Commentor
 */
const payBounty = async (address, tokenId, type = RewardType.BountyForViewer) => {
    const tokenItem = await Token.findOne({ tokenId }, { lockedBounty: 1, minter: 1, owner: 1, streamInfo: 1, _id: 0 }).lean();
    const streamInfo = tokenItem.streamInfo;
    if (!streamInfo?.[streamInfoKeys.isAddBounty]) return;
    const bountyAmount = streamInfo[streamInfoKeys.addBountyAmount];
    const chainId = Number(streamInfo[streamInfoKeys.addBountyChainId]);
    // bounty can be paid only one time for viewer or commentor
    const rewardItem = await Reward.findOne({ address, tokenId, type }, { address: 1 }).lean();
    const field = type === RewardType.BountyForViewer ? 'viewer' : 'commentor';
    if (!rewardItem?.address && streamInfo?.[streamInfoKeys.isAddBounty] && tokenItem.lockedBounty?.[field] >= bountyAmount) {
        const bountyToken = supportedTokens.find(e => e.symbol === streamInfo[streamInfoKeys.addBountyTokenSymbol] && e.chainId === chainId);
        const balanceFilter = { address: tokenItem.minter, tokenAddress: bountyToken?.address?.toLowerCase(), chainId };
        await Token.updateOne({ tokenId }, { $inc: { [`lockedBounty.${field}`]: -bountyAmount } });
        await Balance.updateOne(balanceFilter, { $inc: { lockForBounty: -bountyAmount } });
        await Balance.updateOne({ ...balanceFilter, address }, { $inc: { balance: bountyAmount, reward: bountyAmount } }, overrideOptions);
        await Reward.create({ address, tokenId, from: tokenItem.minter, rewardAmount: bountyAmount, type, chainId });
    }
}
const requestPPVStream = async (account, sig, timestamp, chainId, tokenId) => {
    if (!account || !sig || !timestamp || !chainId) return { result: false, error: 'Please connect with your wallet' };
    if (!isValidAccount(account, timestamp, sig)) return { result: false, error: 'Please sign with your wallet' };
    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem || !nftStreamItem.streamInfo?.[streamInfoKeys.isPayPerView]) return { result: false, error: 'This stream is not locked with ppv' };
    const streamInfo = nftStreamItem.streamInfo;
    if (!(streamInfo[streamInfoKeys.payPerViewChainIds] || [config.defaultChainId])?.includes(chainId)) return { result: false, error: 'Not supported chain' };
    const tokenItem = supportedTokens.find(e => e.symbol === (streamInfo[streamInfoKeys.payPerViewTokenSymbol] || config.defaultTokenSymbol) && e.chainId === chainId);

    const address = normalizeAddress(account);
    const tokenFilter = { tokenAddress: normalizeAddress(tokenItem.address), chainId };

    const ppvTxItem = await PPVTransaction.findOne({ address, streamTokenId: tokenId, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } });
    if (ppvTxItem) return { result: false, error: 'Already paid' };
    const payAmount = streamInfo[streamInfoKeys.payPerViewAmount];
    const balanceItem = await Balance.findOne({ ...tokenFilter, address, }, { balance: 1 });
    if (!balanceItem?.balance || balanceItem.balance < payAmount) return { result: false, error: 'The user have no enough balance' };
    await Balance.updateOne({ address, ...tokenFilter }, { $inc: { balance: -payAmount, paidForPPV: payAmount } });
    const reward = payAmount * (1 - config.developerFee);
    if (nftStreamItem.owner) {
        await Balance.updateOne({ address: nftStreamItem.owner, ...tokenFilter }, { $inc: { balance: reward, reward } }, overrideOptions);
        await Reward.create({ address: nftStreamItem.owner, rewardAmount: reward, tokenId, from: address, chainId, type: RewardType.PayPerView });
        await Token.updateOne({ tokenId }, { $inc: { totalFunds: reward } });
        await Balance.updateOne({ address: config.devWalletAddress, ...tokenFilter }, { $inc: { balance: payAmount * config.developerFee } }, overrideOptions);
    }
    await PPVTransaction.create({ address, amount: payAmount, streamTokenId: tokenId, ...tokenFilter });
    return { result: true };
}

const requestLike = async (account, sig, timestamp, tokenId) => {
    if (!account || !sig || !timestamp) return { result: false, error: 'Please connect with your wallet' };
    if (!isValidAccount(account, timestamp, sig)) return { result: false, error: 'Please sign with your wallet' };
    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };
    const likeItem = await Feature.findOne({ tokenId, address: normalizeAddress(account) });
    if (likeItem) return { result: false, error: 'Already you marked like' };
    await Feature.create({ tokenId, address: normalizeAddress(account) });
    await Token.updateOne({ tokenId }, { $inc: { likes: 1 } });
    return { result: true };
}

/**
 * ### call after authentication is checked ###
 * @param {*} account 
 * @param {*} tokenId 
 * @param {*} tipAmount 
 * @param {*} chainId 
 * @returns true if balance is enough 
 */
const requestTip = async (account, tokenId, tipAmount, chainId) => {
    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };
    const tokenItem = supportedTokens.find(e => e.symbol === config.defaultTokenSymbol && e.chainId === chainId);
    const tokenAddress = normalizeAddress(tokenItem.address);
    const sender = normalizeAddress(account);
    const balanceItem = await Balance.findOne({ address: sender, tokenAddress, chainId, }, { balance: 1 });
    if (!balanceItem?.balance || balanceItem.balance < tipAmount) return { result: false, error: 'The user have no enough balance' };

    if (nftStreamItem.owner) {
        await Balance.updateOne({ address: sender, tokenAddress, chainId },
            { $inc: { balance: -tipAmount, sentTips: tipAmount } });
        await Balance.updateOne({ address: nftStreamItem.owner, tokenAddress, chainId },
            { $inc: { balance: tipAmount, paidTips: tipAmount } });
        await Reward.create({ address: nftStreamItem.owner, rewardAmount: tipAmount, tokenId, from: sender, chainId, type: RewardType.Tip });
        await Token.updateOne({ tokenId }, { $inc: { totalTips: tipAmount } });
    }
    return { result: true };
}

const requestComment = async (account, tokenId, content, commentId) => {
    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };
    account = normalizeAddress(account);
    if (commentId) { // reply
        const commentItem = await Comment.findOne({ id: commentId }, { tokenId: 1 }).lean();
        if (commentItem?.tokenId != tokenId) return { result: false, error: 'invalid comment' };
        const createdComment = await Comment.create({ tokenId, address: account, content, parentId: commentId });
        await Comment.updateOne({ id: commentId }, { $push: { replyIds: createdComment.id } });
    }
    else {
        await Comment.create({ tokenId, address: account, content });
    }
    await payBounty(account, tokenId, RewardType.BountyForCommentor);
    return { result: true };
}

module.exports = {
    signatureForClaim,
    updateWalletBalance,
    requestPPVStream,
    requestLike,
    requestTip,
    requestComment,
    payBounty
};
