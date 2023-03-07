const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let BalanceSchema = new Schema({
    // "Account address"
    address: String,
    chainId: Number,
    // token address for locking or depositing
    tokenAddress: String,
    // "Total deposited amount"
    deposited: Number,
    // Total claimed amount
    claimed: Number,
    // pending balance
    pending: Number,
    // reward got
    reward: Number,
    // staked amount
    staked: Number,
    // total protocol balance 
    balance: { type: Number, default: 0 },
    lockForPPV: Number,
    lockForBounty: Number,
    paidForPPV: Number,
    paidTips: Number,
    sentTips: Number,
    walletBalance: { type: Number, default: 0 }, // balance of wallet
    updateWalletBalanceAt: Date,
    // lastLoginTimestamp: Number,
}, { timestamps: true });

BalanceSchema.index({ address: 1 });
BalanceSchema.index({ address: 1, chainId: 1, tokenAddress: 1 });

module.exports.Balance = mongoose.model('balances', BalanceSchema);