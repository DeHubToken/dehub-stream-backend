const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let TransactionSchema = new Schema({
    from: String,
    to: String,
    tokenAddress: String,
    tokenId: String,
    txHash: String,
    timestamp: Number,
    blockNumber: Number,
    amount: Number,
    type: { type: String, default: "DEPOSIT" }, // DEPOSIT or CLAIM
    logIndex: Number,
    status: String,
    chainId: Number,
}, { timestamps: true });


TransactionSchema.index({ blockNumber: 1 })
TransactionSchema.index({ type: 1 })
TransactionSchema.index({ createdAt: 1 })
TransactionSchema.index({ txHash: 1, logIndex: 1, chainId: 1 })

module.exports.Transaction = mongoose.model('transactions', TransactionSchema); 