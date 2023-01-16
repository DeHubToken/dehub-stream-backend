const mongoose = require('mongoose')

const Feature = mongoose.Schema({
    tokenId: Number,
    address: String,
}, {
    timestamps: true
})

Feature.index({ tokenId: 1, address: 'text' });
module.exports = mongoose.model("Feature", Feature);