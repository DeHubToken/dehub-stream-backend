const mongoose = require('mongoose');
const { ReactionType, ReactionSubjectType } = require('../config/constants');
const Schema = mongoose.Schema;

let ReactionSchema = new Schema({
    // "addresses"
    addresses: [{ type: String, lowercase: true }],
    // "subject" message timetoken or comment id
    subjectId: String,
    // "reaction type" LIKE, UNLIKE, and so on
    type: { type: String, enum: Object.values(ReactionType), default: ReactionType.Like, index: true },
    // "value"
    value: Number,
    // "subject type" message or comment? MSG, COMMENT
    subjectType: { type: String, enum: Object.values(ReactionSubjectType), default: ReactionSubjectType.Message, index: true },
}, { timestamps: true });

module.exports.Reaction = mongoose.model('reactions', ReactionSchema);