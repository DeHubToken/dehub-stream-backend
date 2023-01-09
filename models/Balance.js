const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let BalanceSchema = new Schema({
    // "Account address"
    address: String,
    chainId: Number,
    // token address for locking or depositing
    tokenAddress: String,
    // "Total deposited amount"
    depositedBalance: Number,
    // Total claimed amount
    claimedBalance: Number,
    // pending balance
    pendingBalance: Number,
    // reward got
    rewardBalance: Number,
    // total protocol balance 
    balance: Number,
    walletBalance: Number, // balance of wallet
    updateWalletBalanceAt: Date,
    // lastLoginTimestamp: Number,
}, { timestamps: true });

BalanceSchema.index({ address: 1 });
module.exports.Balance = mongoose.model('balances', BalanceSchema);