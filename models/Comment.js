const mongoose = require('mongoose');
const IDCounter = require('./IDCounter');

const Comment = mongoose.Schema({
    id: { type: Number, unique: true },
    tokenId: Number,
    address: String,
    content: String,
    replyIds: [Number],
    parentId: Number,
}, {
    timestamps: true
})

Comment.pre("save", function (next) {
    let doc = this;
    if (!doc.id)
        IDCounter.findOneAndUpdate(
            { id: "commentId" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
            function (error, counter) {
                if (error) return next(error);
                doc.id = counter.seq;
                next();
            }
        );
    else next();
});

Comment.index({ tokenId: 1, address: 'text' });
module.exports = mongoose.model("Comment", Comment);