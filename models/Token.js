require('dotenv').config();
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const IDCounter = require("./IDCounter");
const { NFT_NAME_PREFIX } = require("../shared/contants");

let TokenSchema = new Schema({
    symbol: String,
    address: String,  // collection address
    name: { type: String, index: true },
    decimals: Number, // 1
    chainId: Number,  // 56
    logoURI: String,
    totalSupply: Number,    // total supply
    tokenId: { type: Number, unique: true },
    price: Number,
    metaDataUrl: String,
    imageUrl: String, //related path
    videoUrl: String, //related path
    site: String, //
    contractAddress: String,
    minter: String,
    owner: String,
    streamInfo: Object,
    videoExt: String,
    imageExt: String,
    description: String,
    videoInfo: Object,
    videoDuration: { type: Number, index: true }, // in second unit
    videoFilePath: { type: String },
    likes: { type: Number, index: true },
    views: { type: Number, index: true },
    comments: { type: Number, index: true },
    totalVotes: Object, // ex: {for: 15, against: 1}
    lockedBounty: Object,
    totalTips: { type: Number, index: true }, // total tips received from any users
    totalFunds: { type: Number, index: true }, // total funds received from pay per view
    status: {
        type: String,
        default: "signed",
        enum: ["signed", "pending", "minted", "deleted", "failed", "burned", "checking"],
    },
    transcodingStatus: String,
    category: [String],
}, { timestamps: true });


TokenSchema.pre("save", function (next) {
    let doc = this;
    if (!doc.tokenId)
        IDCounter.findOneAndUpdate(
            { id: "tokenId" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
            function (error, counter) {
                if (error) return next(error);
                doc.tokenId = counter.seq;
                if (!doc.name) doc.name = `${NFT_NAME_PREFIX} #${doc.tokenId}`;
                if (!doc.imageUrl) doc.imageUrl = `nfts/images/${doc.tokenId}.${doc.imageExt ? doc.imageExt : 'png'}`;
                if (!doc.videoUrl) doc.videoUrl = `streams/video/${doc.tokenId}`;
                next();
            }
        );
    else next();
});

TokenSchema.index({ minter: 1 });
TokenSchema.index({ category: 1 });

module.exports.Token = mongoose.model('tokens', TokenSchema);