const mongoose = require('mongoose')

const Tip = mongoose.Schema({
    tokenId: Number,
    address: String,
    amount: Number
}, {
    timestamps: true
})

Tip.index({ tokenId: 1, address: 'text' });
module.exports = mongoose.model("tips", Tip);