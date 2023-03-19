const mongoose = require('mongoose')

const Setting = mongoose.Schema({
    // last fetched block number for each chainId
    lastFetchedBlock: Object,
    lastBlockFetchedForTransfer: Object,
    lastBlockFetchedForProtocolTx: Object,
    syncedDiffTimeOfGraph: Object,
}, {
    timestamps: true
})

module.exports.Setting = mongoose.model("settings", Setting)