const { config } = require("../config");
const { supportedChainIds, streamInfoKeys, supportedTokens } = require("../config/constants");
const Comment = require("../models/Comment");
const { PPVTransaction } = require("../models/PPVTransaction");
const { Transaction } = require("../models/Transaction");
const { Token } = require("../models/Token");
const { WatchHistory } = require("../models/WatchHistory");
const { normalizeAddress } = require("./format");
const { Account } = require("../models/Account");
const { Balance } = require("../models/Balance");

function removeDuplicatedObject(arr, subKey,) {
    var m = {};
    if (!subKey) subKey = '';
    var newarr = [];
    for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (subKey != '') v = arr[i][subKey];
        if (!m[v]) {
            m[v] = 1;
            newarr.push(arr[i]); // returned array cell    
        } else m[v]++
    }
    for (var i = 0; i < newarr.length; i++) {
        var item = newarr[i];
        newarr[i].duplicatedCnt = m[item[subKey]]
    }
    return newarr;
}

const isUnlockedPPVStream = async (streamTokenId, account) => {
    const ppvTxItem = await PPVTransaction.findOne({ address: normalizeAddress(account), streamTokenId, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } }, { createdAt: 1 }).lean();
    if (ppvTxItem && ppvTxItem.createdAt) return true;
    return false;
}

const isUnlockedLockedContent = async (streamInfo, account) => {
    const symbol = streamInfo?.[streamInfoKeys.lockContentTokenSymbol] || config.defaultTokenSymbol;
    const chainIds = streamInfo?.[streamInfoKeys.lockContentChainIds] || [config.defaultChainId];
    const tokenAddresses = supportedTokens.filter(e => e.symbol === symbol && chainIds?.includes(e.chainId))?.map(e => e.address);
    const lockContentAmount = Number(streamInfo?.[streamInfoKeys.lockContentAmount] || 0);
    const balanceItems = await Balance.find({
        address: account,
        tokenAddress: { $in: tokenAddresses.map(e => normalizeAddress(e)) },
    }, { walletBalance: 1 }).lean();
    if (!balanceItems?.length) return false;
    for (const item of balanceItems) {
        if (item.walletBalance >= lockContentAmount) { return true; }
    }
    return false;
}

const isValidTipAmount = amount => amount <= config.rangeOfTip.max && amount >= config.rangeOfTip.min;

const isSupportedChain = chainId => supportedChainIds.includes(chainId)

const eligibleBountyForAccount = async (account, tokenId) => {
    account = normalizeAddress(account);
    const tokenItem = await Token.findOne({ tokenId }, { streamInfo: 1, lockedBounty: 1, minter: 1 }).lean();
    const result = { commentor: false, viewer: false };
    if (!tokenItem?.streamInfo?.[streamInfoKeys.isAddBounty] || account === tokenItem.minter) return result;
    const counterOfViewers = tokenItem?.streamInfo?.[streamInfoKeys.addBountyFirstXViewers];
    const counterOfCommentors = tokenItem?.streamInfo?.[streamInfoKeys.addBountyFirstXComments];

    // check history
    const claimTxes = await Transaction.find({ from: account, tokenId, $or: [{ type: 'BOUNTY_VIEWER' }, { type: 'BOUNTY_COMMENTOR' }] }, { type: 1, _id: 0, }).lean();
    if (claimTxes.find(e => e.type === 'BOUNTY_VIEWER')) {
        result.viewer_claimed = true;
    }
    else if (tokenItem?.lockedBounty?.['viewer'] > 0.00001) {
        const watchStreams = await WatchHistory.find({ tokenId, status: 'confirmed' }).sort({ createdAt: 1 }).distinct('watcherAddress');
        const index = watchStreams.findIndex(e => e === account);
        if (index >= 0 && index < counterOfViewers) result.viewer = true;
    }
    if (claimTxes.find(e => e.type === 'BOUNTY_COMMENTOR')) {
        result.commentor_claimed = true;
    } else if (tokenItem?.lockedBounty?.['commentor'] > 0.0001) {
        const comments = await Comment.find({ tokenId }, { watcherAddress: 1 }).sort({ createdAt: 1 }).distinct('address');
        const index = comments.findIndex(e => e === account);
        if (index >= 0 && index < counterOfCommentors) result.commentor = true;
    }
    return result;
}

const isValidUsername = async (address, username) => {
    if (username === 'mine') return { result: false, error: true, error_msg: `username can't be 'mine'` };
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return { result: false, error: true, error_msg: 'username can only contain letters, numbers, hyphens (-), and underscores' };
    const accountWithSameName = await Account.findOne({ username, address: { $ne: address } }, { username: 1 }).lean();
    if (accountWithSameName) return { result: false, error: true, error_msg: 'The username is already in use' };
    return { result: true };
}

const isValidSearch = (searchStr) => {
    var format = /[`#@$%^&*()_+\-=\[\]{};':"\\|,.<>\/~]/;
    return !format.test(searchStr);
}

const removeDuplicatedElementsFromArray = (arr) => {
    if (arr?.length > 0)
        return arr.filter((item,
            index) => arr.indexOf(item) === index);
    return undefined;
}

const isUserCanAddNewCategory = async (address) => {    
    const stakedBalance = await Balance.findOne({ address, chainId: 56, staked: { $gte: 10_000 } }, { staked: 1 });
    return !!stakedBalance;
}

module.exports = {
    removeDuplicatedObject,
    removeDuplicatedElementsFromArray,
    isUnlockedPPVStream,
    isUnlockedLockedContent,
    isValidTipAmount,
    isSupportedChain,
    eligibleBountyForAccount,
    isValidUsername,
    isValidSearch,
    isUserCanAddNewCategory,
}