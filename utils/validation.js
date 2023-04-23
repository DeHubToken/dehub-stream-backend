const { config } = require("../config");
const { supportedChainIds, streamInfoKeys } = require("../config/constants");
const Comment = require("../models/Comment");
const { PPVTransaction } = require("../models/PPVTransaction");
const { Transaction } = require("../models/Transaction");
const { Token } = require("../models/Token");
const { WatchHistory } = require("../models/WatchHistory");
const { normalizeAddress } = require("./format");

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


module.exports = {
    removeDuplicatedObject,
    isUnlockedPPVStream,
    isValidTipAmount,
    isSupportedChain,
    eligibleBountyForAccount
}