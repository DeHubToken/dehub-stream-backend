const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let ClaimTransactionSchema = new Schema({
    // "address that claims token"
    receiverAddress: String,
    amount: Number,
    timstamp: Number,
    txHash: String,
    block: Number,
    logIndex: Number,
    status: { type: String, enum:['pending', 'confirmed', 'expired'], default: 'pending'},
}, { timestamps: true });

module.exports.ClaimTransaction = mongoose.model('claim_transactions', ClaimTransactionSchema);