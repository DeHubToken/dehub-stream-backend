/**
 * this includes functions to get some statistics data like leaderboard and so on
 */
require('dotenv').config();
const { config } = require("../config");
const { supportedTokens, tokenTemplate, blacklistOnLeaderboard } = require("../config/constants");
const { Balance } = require("../models/Balance");
const { Token } = require('../models/Token');
const { normalizeAddress } = require("../utils/format");

const getLeaderboard = async (sort = null) => {
    try {
        const mainTokenAddresses = supportedTokens.filter(e => e.symbol === config.defaultTokenSymbol).map(f => {
            return { tokenAddress: normalizeAddress(f.address) };
        });
        // @dev only
        const dhbAddressOnBSC = normalizeAddress("0x680D3113caf77B61b510f332D5Ef4cf5b41A761D")
        if (!mainTokenAddresses.includes(dhbAddressOnBSC)) mainTokenAddresses.push({ tokenAddress: dhbAddressOnBSC });
        const sortOption = {
            $sort: (sort === null || sort === 'holdings') ? { total: -1 } : (sort === 'sentTips' ? { sentTips: -1 } : { receivedTips: -1 })
        }
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
                    sumBalance: { '$sum': { '$add': [{ $ifNull: ['$walletBalance', 0] }, { $ifNull: ['$staked', 0] }/* , { $ifNull: ['$balance', 0] }*/] } },
                    account: { $first: '$account' }
                }
            },
            {
                $project: {
                    account: '$_id',
                    _id: 0,
                    total: '$sumBalance',
                    username: { $first: '$account.username' },
                    userDisplayName: { $first: '$account.displayName' },
                    avatarUrl: { $first: '$account.avatarImageUrl' },
                    sentTips: { $first: '$account.sentTips' },
                    receivedTips: { $first: '$account.receivedTips' },
                }
            },
            sortOption,
            {
                $limit: 20
            }
        ];
        let result = await Balance.aggregate(query);

        if (result) { // exclude by blacklist
            result = result.filter(e => !blacklistOnLeaderboard.includes(e.account))
        }
        return { result: { byWalletBalance: result } };
    }
    catch (err) {
        console.log('-----calculate leaderboard:', err);
        return { result: false, error: 'calculate leaderboard was failed' };
    }
}

const getStreamNfts = async (filter, skip, limit, sortOption = null) => {
    try {
        const query = [
            {
                $match: filter
            },
            {
                $lookup: {
                    from: 'accounts',
                    localField: 'minter',
                    foreignField: 'address',
                    as: 'account'
                }
            },
            {
                $lookup: {
                    from: 'balances',
                    localField: 'minter',
                    foreignField: 'address',
                    pipeline: [
                        {
                            $match: {
                                tokenAddress: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d'
                            }
                        },
                        {
                            $project: {
                                staked: 1, _id: 0
                            }
                        }
                    ],
                    as: 'balance'
                }
            },
            {
                $project: {
                    ...tokenTemplate,
                    mintername: { $first: '$account.username' },
                    minterDisplayName: { $first: '$account.displayName' },
                    minterAvatarUrl: { $first: '$account.avatarImageUrl' },
                    minterStaked: { $first: '$balance.staked' },
                }
            },
            {
                $sort: sortOption ? sortOption : {
                    createdAt: -1
                }
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            }
        ];
        const result = await Token.aggregate(query);
        return result;
    }
    catch (err) {
        console.log('-----get stream nfts:', err);
        return { result: false, error: 'fetching was failed' };
    }
}

module.exports = {
    getLeaderboard,
    getStreamNfts
}