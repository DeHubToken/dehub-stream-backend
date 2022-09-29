const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let TokenSchema = new Schema({
    symbol: String, 
    address: String,  // collection address
    name: String,
    decimals: Number, // 1
    chainId: Number,  // 56
    logoURI: String,    
    ts: String, //totalsupply
    price: Number,
    metaDataUrl: String,
    imageUrl: String,
    site: String, //
}, { timestamps: true });

module.exports.Token = mongoose.model('tokens', TokenSchema);