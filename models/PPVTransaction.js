const mongoose = require('mongoose');
const { RewardType } = require('../config/constants');
const Schema = mongoose.Schema;

let PPVTransactionSchema = new Schema({
    // "payer address"
    address: String,    
    // "paid amount"
    amount: Number,
    // token id for stream nft
    streamTokenId: Number,
    // chain id
    chainId: Number,
    // token address paid
    tokenAddress: String,    
}, { timestamps: true });

module.exports.PPVTransaction = mongoose.model('ppv_transactions', PPVTransactionSchema);