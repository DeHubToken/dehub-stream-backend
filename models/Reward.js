const mongoose = require('mongoose');
const { RewardType } = require('../config/constants');
const Schema = mongoose.Schema;

let RewardSchema = new Schema({
    // "Account address"
    address: String,
    // "reward amount"
    rewardAmount: Number,
    // token id for stream nft
    tokenId: Number,
    // updated timestamp
    from: String,
    // chain id
    chainId: Number,
    // type : pay per view, bounty, tip
    type: { type: String, enum: Object.values(RewardType), default: RewardType.PayPerView, index: true },
}, { timestamps: true });

module.exports.Reward = mongoose.model('rewards', RewardSchema);