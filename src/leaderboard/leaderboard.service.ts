import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { Request, Response } from 'express';
import { blacklistOnLeaderboard, supportedTokens } from 'config/constants';
import { Balance } from 'models/Balance';
import { normalizeAddress } from 'common/util/format';
import {config} from 'config';

@Injectable()
export class LeaderboardService {
  async getLeaderboard (req:Request, res:Response) {
    const sort = reqParam(req, 'sort');
    const mainTokenAddresses = supportedTokens
      .filter(e => e.symbol === config.defaultTokenSymbol)
      .map(f => {
        return { tokenAddress: normalizeAddress(f.address) };
      });
    // @dev only
    const dhbAddressOnBSC:any = normalizeAddress('0x680D3113caf77B61b510f332D5Ef4cf5b41A761D');
    if (!mainTokenAddresses.includes(dhbAddressOnBSC)) mainTokenAddresses.push({ tokenAddress: dhbAddressOnBSC });
    const sortOption = {
      $sort:
        sort === null || sort === 'holdings'
          ? { total: -1 }
          : sort === 'sentTips'
          ? { sentTips: -1 }
          : { receivedTips: -1 },
    };
    const query:any = [
      {
        $match: {
          $or: mainTokenAddresses,
        },
      },
      {
        $lookup: {
          from: 'accounts',
          localField: 'address',
          foreignField: 'address',
          as: 'account',
        },
      },
      {
        $group: {
          _id: '$address',
          sumBalance: {
            $sum: {
              $add: [
                { $ifNull: ['$walletBalance', 0] },
                { $ifNull: ['$staked', 0] } /* , { $ifNull: ['$balance', 0] }*/,
              ],
            },
          },
          account: { $first: '$account' },
        },
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
        },
      },
      {
        $match: {
          $or: [{ sentTips: { $gt: 0 } }, { receivedTips: { $gt: 0 } }, { total: { $gt: 0 } }],
        },
      },
      sortOption,
      {
        $limit: 500,
      },
    ];
    let result = await Balance.aggregate(query);

    if (result) {
      // exclude by blacklist
      result = result.filter(e => !blacklistOnLeaderboard.includes(e.account));
    }
    return res.json({ result: { byWalletBalance: result } })
  }
}
