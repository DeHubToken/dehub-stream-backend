const mongoose = require('mongoose')

const Vote = mongoose.Schema({
    tokenId: Number,
    address: String,
    vote: Boolean
}, {
    timestamps: true
})

Vote.index({ tokenId: 1 });
Vote.index({ tokenId: 1, address: 'text' });
module.exports = mongoose.model("Vote", Vote);