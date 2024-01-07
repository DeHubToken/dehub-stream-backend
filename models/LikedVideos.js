const mongoose = require('mongoose');
const Schema = mongoose.Schema;
// type: String | undefined | null | Number
const LikedSchema = new Schema(
  {
    address: String,
    tokenId: { type: Schema.Types.ObjectId, ref: 'tokens' },
  },
  { timestamps: true },
);

module.exports.LikedVideos = mongoose.model('upvote', LikedSchema);
