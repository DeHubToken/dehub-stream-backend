const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let RewardSchema = new Schema({
    // "Account address"
    address: String,
    // "vote amount"
    rewardAmount: Number,
    // token id for stream nft
    tokenId: Number,
    // updated timestamp
    from: String,
}, { timestamps: true });

module.exports.Reward = mongoose.model('rewards', RewardSchema);