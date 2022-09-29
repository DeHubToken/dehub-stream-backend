const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let RewardSchema = new Schema({
    // "Account address"
    address: String,
    // "vote amount"
    rewardAmount: Number,
    // token id for song nft
    totalScore: Number,
    // updated timestamp
    percent: Number,
    score: Number,
}, { timestamps: true });

module.exports.Reward = mongoose.model('rewards', RewardSchema);