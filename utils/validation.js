const { config } = require("../config");
const { PPVTransaction } = require("../models/PPVTransaction");
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

module.exports = {
    removeDuplicatedObject,
    isUnlockedPPVStream,
    isValidTipAmount
}