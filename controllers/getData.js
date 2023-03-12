/**
 * this includes functions to get some statistics data like leaderboard and so on
 */
require('dotenv').config();
const { config } = require("../config");
const { supportedTokens } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { normalizeAddress } = require("../utils/format");

const getLeaderboard = async () => {
    try {
        const mainTokenAddresses = supportedTokens.filter(e => e.symbol === config.defaultTokenSymbol).map(f => {
            return { tokenAddress: normalizeAddress(f.address) };
        });
        // @dev only
        mainTokenAddresses.push({ tokenAddress: normalizeAddress("0x680D3113caf77B61b510f332D5Ef4cf5b41A761D") });
        const query = [
            {
                $match: {
                    $or: mainTokenAddresses
                }
            },
            {
                $lookup: {
                    from: 'accounts',
                    localField: 'address',
                    foreignField: 'address',
                    as: 'account'
                }
            },
            {
                $group: {
                    _id: '$address',
                    sumBalance: { '$sum': { '$add': [{ $ifNull: ['$walletBalance', 0] }, { $ifNull: ['$staked', 0] }, { $ifNull: ['$balance', 0] }] } },
                    account: { $first: '$account' }
                }
            },
            {
                $project: {
                    account: '$_id',
                    _id: 0,
                    total: '$sumBalance',
                    username: { $first: '$account.username' },
                    avatarUrl: { $first: '$account.avatarImageUrl' },
                }
            },
            {
                $sort: {
                    total: -1
                }
            },
            {
                $limit: 20
            }
        ];
        let result = await Balance.aggregate(query);
        return { result: { byWalletBalance: result } };
    }
    catch (err) {
        console.log('-----calculate leaderboard:', err);
        return { result: false, error: 'calculate leaderboard was failed' };
    }
}

module.exports = {
    getLeaderboard
}