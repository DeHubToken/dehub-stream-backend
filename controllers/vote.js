const { Token } = require("../models/Token");
const Vote = require("../models/Vote");
const { normalizeAddress } = require("../utils/format");

const requestVote = async (account, tokenId, vote) => {
    account = normalizeAddress(account);
    const voteItem = await Vote.findOne({ address: account, tokenId }, { vote: 1 }).lean();
    if (voteItem) return { result: false, error: `already voted ${vote?'yes':'no'}` };

    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };

    await Vote.create({ address: account, tokenId, vote: vote === 'true' ? true : false });
    const updateTokenOption = {};
    updateTokenOption[vote === 'true' ? 'totalVotes.for' : 'totalVotes.against'] = 1;
    await Token.updateOne({ tokenId }, { $inc: updateTokenOption });
    return { result: true };
}

module.exports = {
    requestVote,
}
