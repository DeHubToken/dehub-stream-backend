const { config } = require("../config");
const { overrideOptions } = require("../config/constants");
const { Token } = require("../models/Token");
const Vote = require("../models/Vote");
const { normalizeAddress } = require("../utils/format");
const { getStakedAmountOfAddresses } = require("../utils/web3");

const requestVote = async (account, tokenId, vote) => {
    account = normalizeAddress(account);
    const voteItem = await Vote.findOne({ address: account, tokenId }, { vote: 1 }).lean();
    if (voteItem) return { result: false, error: `already voted ${vote ? 'yes' : 'no'}` };

    const nftStreamItem = await Token.findOne({ tokenId }, {}).lean();
    if (!nftStreamItem) return { result: false, error: 'This stream no exist' };

    await Vote.create({ address: account, tokenId, vote: vote === 'true' ? true : false });
    const updateTokenOption = {};
    updateTokenOption[vote === 'true' ? 'totalVotes.for' : 'totalVotes.against'] = 1;
    const updatedTokenItem = await Token.updateOne({ tokenId }, { $inc: updateTokenOption }, overrideOptions);
    console.log('-- voted', account, tokenId, vote);
    return { result: true };
}

async function deleteVotedStream(tokenItem) {
    const yesVotes = tokenItem?.totalVotes?.for || 0;
    const noVotes = tokenItem?.totalVotes?.against || 0;
    const tokenId = tokenItem.tokenId;
    if (noVotes + yesVotes >= config.votesForDeleting && noVotes >= 0.9 * (yesVotes + noVotes)) {
        // check stakeAmounts
        const totalVoteAccounts = await Vote.find({ tokenId, vote: false }, { address: 1 }).distinct('address');
        try {
            const stakedAmounts = await getStakedAmountOfAddresses(totalVoteAccounts);
            let sum = 0;
            Object.values(stakedAmounts).map(e => { sum += e; });
            if (sum >= config.totalStakedForDeleting) {
                // this video should be deleted
                await Token.updateOne({ tokenId }, { status: 'deleted' });
            }
        }
        catch (e) {
            console.log(e);
        }
    }
}

module.exports = {
    requestVote,
    deleteVotedStream
}
