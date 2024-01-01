const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let AccountSchema = new Schema(
  {
    // "Account address"
    address: String,
    lastLoginTimestamp: Number,
    username: String, // user profile
    displayName: String, // this can be overrided.
    email: String,
    avatarImageUrl: String,
    coverImageUrl: String,
    aboutMe: String,
    facebookLink: String,
    twitterLink: String,
    discordLink: String,
    instagramLink: String,
    tiktokLink: String,
    youtubeLink: String,
    telegramLink: String,
    sentTips: Number,
    receivedTips: Number,
    // count of streams uploaded by the account
    uploads: Number,
    followers: Number,
    likes: Number,
    customs: Object,
    online: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

AccountSchema.index({ address: 1 }, { unique: true });
module.exports.Account = mongoose.model('accounts', AccountSchema);
