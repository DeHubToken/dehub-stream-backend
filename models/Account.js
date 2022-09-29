const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let AccountSchema = new Schema({
    // "Account address"
    address: String,
    // "Total deposited amount"
    depositedBalance: Number,
    // Total claimed amount
    claimedBalance: Number,
    // pending balance
    pendingBalance: Number,
    // reward got
    rewardBalance: Number,
    // Total claimed amount
    balance: Number,
    loginDate: Date,
    username: String,
    email: String
}, { timestamps: true });

AccountSchema.index({ address: 1 });
module.exports.Account = mongoose.model('accounts', AccountSchema);