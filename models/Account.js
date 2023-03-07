const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let AccountSchema = new Schema({
    // "Account address"
    address: String,    
    lastLoginTimestamp: Number,    
    username: String,  // user profile
    email: String,
    avatarImageUrl: String,
    coverImageUrl: String,
    aboutMe: String,
    facebookLink: String,
    twitterLink: String,
    discordLink: String,
    instagramLink: String,
}, { timestamps: true });

AccountSchema.index({ address: 1 });
module.exports.Account = mongoose.model('accounts', AccountSchema);