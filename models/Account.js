const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let AccountSchema = new Schema({
    // "Account address"
    address: String,
    // "Total deposited amount"
    // deposited: Number,
    // Total claimed amount
    // claimedBalance: Number,
    // pending balance
    // pendingBalance: Number,
    // reward got
    // rewardBalance: Number,
    // Total claimed amount
    // balance: Number,
    // dhbBalance: Number, // balance of wallet
    lastLoginTimestamp: Number,

    username: String,  // user profile
    email: String,
    avatarImageUrl: String,
    coverImageUrl: String,
    aboutMe: String,
    facebookLink: String,
    twitterLink: String,
    discordLink: String,
    instagramLink: String,
}, { timestamps: true });

AccountSchema.index({ address: 1 });
module.exports.Account = mongoose.model('accounts', AccountSchema);