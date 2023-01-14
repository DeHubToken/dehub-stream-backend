const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let WatchHistorySchema = new Schema({
    tokenId: { type: Number, index: true},
    watcherAddress: { type: String, index: true},
    startedAt: { type: Date, index: true},
    exitedAt: {type: Date},
    status: String, // created, confimed, pendingForPPV, lockForPPV, failedForPPV
    chainId: Number,
    lastWatchedFrame: Number,
    watchedTime: Number, // in second unit    
    fundedTokenValue: Number,
}, { timestamps: true });
WatchHistorySchema.index({status: 1});
module.exports.WatchHistory = mongoose.model('watch_history', WatchHistorySchema); 