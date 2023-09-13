const { overrideOptions } = require("../../config/constants");
const { Reaction } = require("../../models/Reaction")

const requestReaction = async (requestData) => {
    const { subjectId, subjectType, reactionType, address } = requestData;
    const reaction = await Reaction.findOne({ type: reactionType, subjectType, subjectId });
    let result = null;
    const reactionOptions = { ...overrideOptions, fields: { value: 1, subjectId: 1, subjectType: 1, type: 1, _id: 0 } }
    if (!reaction || reaction.value === 0) {
        result = await Reaction.findOneAndUpdate({ subjectId, subjectType, type: reactionType }, { addresses: [address], value: 1 }, reactionOptions).lean();
    }
    else {
        if (reaction.addresses?.includes(address)) {
            if (reaction.value <= 1)
                await Reaction.deleteOne({ subjectId, subjectType, type: reactionType });
            else
                result = await Reaction.findOneAndUpdate({ subjectId, subjectType, type: reactionType }, { $pull: { addresses: address }, $inc: { value: -1 } }, reactionOptions).lean();
        }
        else
            result = await Reaction.findOneAndUpdate({ subjectId, subjectType, type: reactionType }, { $push: { addresses: address }, $inc: { value: 1 } }, reactionOptions).lean();
    }
    return { result };
}

module.exports = {
    requestReaction
}