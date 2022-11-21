const mongoose = require('mongoose')
const {LowerCaseType} = require("./types/customTypes");

const Collection = mongoose.Schema({
    address: LowerCaseType,     // collection contract address
    lastPendingTokenId: Number, // token id to be requested to mint last time, user has signed request, but may not mint nft contract.
    lastMintedTokenId: Number,  // token id minted last time.
    name: String,
    logo: String,
    type: String,   // 1155 or 721
    description: String,
    defaultPrice: Number    
}, {
    timestamps: true
})


Collection.index({address: 1}, {unique: true});
Collection.index({name: 'text', description: 'text'});

module.exports = mongoose.model("collections", Collection)