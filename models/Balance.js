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
    // total protocol balance 
    balance: Number,
    lockForPPV: Number,
    paidForPPV: Number,
    walletBalance: Number, // balance of wallet
    updateWalletBalanceAt: Date,
    // lastLoginTimestamp: Number,
}, { timestamps: true });

BalanceSchema.index({ address: 1 });
BalanceSchema.index({ address: 1, chainId: 1, tokenAddress: 1 });
module.exports.Balance = mongoose.model('balances', BalanceSchema);