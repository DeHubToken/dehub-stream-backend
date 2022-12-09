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
    ts: String, //totalsupply
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
    videoDuration: { type: Number, index: true }, // in second unit
    videoFilePath: { type: String },
    status: {
        type: String,
        default: "signed",
        enum: ["signed", "pending", "minted"],
    },
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
module.exports.Token = mongoose.model('tokens', TokenSchema);