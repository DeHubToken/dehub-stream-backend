const mongoose = require('mongoose')

const Follow = mongoose.Schema({
    address: String,
    following: String // following address
}, {
    timestamps: true
})

Follow.index({ address: 'text' });
Follow.index({ following: 'text' });
module.exports = mongoose.model("followes", Follow);