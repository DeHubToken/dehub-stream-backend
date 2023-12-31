const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema(
  {
    address: String,
    tokenId: String | undefined | null | Number,
    type: String, // like, dislike, tip, following, videoRemoval
    content: String,
    createdAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports.Notification = mongoose.model('notifications', NotificationSchema);
