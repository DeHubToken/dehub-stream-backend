import {config}  from '../../config';
import { supportedChainIds, streamInfoKeys, supportedTokens } from '../../config/constants';
import { TokenModel } from '../../models/Token';
import { normalizeAddress } from './format';
import { Balance } from '../../models/Balance';
import { CommentModel } from 'models/Comment';
import { WatchHistoryModel } from 'models/WatchHistory';
import { AccountModel } from 'models/Account';
import { PPVTransactionModel } from 'models/PPVTransaction';
import TransactionModel from 'models/Transaction';

function removeDuplicatedObject<T>(arr: T[], subKey?: keyof T): (T & { duplicatedCnt?: number })[] {
  const m: { [key: string]: number } = {};
  const newarr: (T & { duplicatedCnt?: number })[] = [];
  
  for (let i = 0; i < arr.length; i++) {
    const v = subKey ? (arr[i][subKey] as unknown as string) : JSON.stringify(arr[i]); // Use JSON.stringify for full object comparison

    if (!m[v]) {
      m[v] = 1;
      const item = { ...arr[i], duplicatedCnt: 1 }; // Clone the object and set duplicatedCnt
      newarr.push(item);
    } else {
      m[v]++;
      // Update the duplicatedCnt of the existing object in newarr
      const existingItem = newarr.find(item => subKey ? item[subKey] === arr[i][subKey] : JSON.stringify(item) === JSON.stringify(arr[i]));
      if (existingItem) {
        existingItem.duplicatedCnt = m[v];
      }
    }
  }
  
  return newarr;
}


const isUnlockedPPVStream = async (streamTokenId: string, account: string): Promise<boolean> => {
  const ppvTxItem:any = await PPVTransactionModel.findOne(
    {
      address: normalizeAddress(account),
      streamTokenId,
      createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) },
    },
    { createdAt: 1 },
  ).lean();
  
  return !!(ppvTxItem && ppvTxItem.createdAt);
};

const isUnlockedLockedContent = async (streamInfo: any, account: string): Promise<boolean> => {
  const symbol = streamInfo?.[streamInfoKeys.lockContentTokenSymbol] || config.defaultTokenSymbol;
  const chainIds = streamInfo?.[streamInfoKeys.lockContentChainIds] || [config.defaultChainId];
  const tokenAddresses = supportedTokens
    .filter(e => e.symbol === symbol && chainIds?.includes(e.chainId))
    ?.map(e => e.address);
  
  const lockContentAmount = Number(streamInfo?.[streamInfoKeys.lockContentAmount] || 0);
  
  const balanceItems = await Balance.find(
    {
      address: account,
      tokenAddress: { $in: tokenAddresses.map(e => normalizeAddress(e)) },
    },
    { walletBalance: 1 },
  ).lean();
  
  if (!balanceItems?.length) return false;
  
  return balanceItems.some(item => item.walletBalance >= lockContentAmount);
};

const isValidTipAmount = (amount: number): boolean => 
  amount <= config.rangeOfTip.max && amount >= config.rangeOfTip.min;

const isSupportedChain = (chainId: number): boolean => 
  supportedChainIds.includes(chainId);

const eligibleBountyForAccount = async (account: string, tokenId: string): Promise<any> => {
  account = normalizeAddress(account);
  const tokenItem = await TokenModel.findOne({ tokenId }, { streamInfo: 1, lockedBounty: 1, minter: 1 }).lean();
  const result = { commentor: false, viewer: false, viewer_claimed: false, commentor_claimed: false };
  
  if (!tokenItem?.streamInfo?.[streamInfoKeys.isAddBounty] || account === tokenItem.minter) return result;

  const counterOfViewers = tokenItem?.streamInfo?.[streamInfoKeys.addBountyFirstXViewers];
  const counterOfCommentors = tokenItem?.streamInfo?.[streamInfoKeys.addBountyFirstXComments];

  // Check history
  const claimTxes = await TransactionModel.find(
    { from: account, tokenId, $or: [{ type: 'BOUNTY_VIEWER' }, { type: 'BOUNTY_COMMENTOR' }] },
    { type: 1, _id: 0 },
  ).lean();

  if (claimTxes.find(e => e.type === 'BOUNTY_VIEWER')) {
    result.viewer_claimed = true;
  } else if (tokenItem?.lockedBounty?.['viewer'] > 0.00001) {
    const watchStreams = await WatchHistoryModel.find({ tokenId, status: 'confirmed' })
      .sort({ createdAt: 1 })
      .distinct('watcherAddress');
    const index = watchStreams.findIndex(e => e === account);
    if (index >= 0 && index < counterOfViewers) result.viewer = true;
  }

  if (claimTxes.find(e => e.type === 'BOUNTY_COMMENTOR')) {
    result.commentor_claimed = true;
  } else if (tokenItem?.lockedBounty?.['commentor'] > 0.0001) {
    const comments = await CommentModel.find({ tokenId }, { watcherAddress: 1 }).sort({ createdAt: 1 }).distinct('address');
    const index = comments.findIndex(e => e === account);
    if (index >= 0 && index < counterOfCommentors) result.commentor = true;
  }

  return result;
};

const isValidUsername = async (address: string, username: string): Promise<{ result: boolean; error?: string; error_msg?: string }> => {
  if (username === 'mine')
    return { result: false, error: `username can't be 'mine'`, error_msg: `username can't be 'mine'` };
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username))
    return {
      result: false,
      error: 'username can only contain letters, numbers, hyphens (-), and underscores',
      error_msg: 'username can only contain letters, numbers, hyphens (-), and underscores',
    };
  
  const accountWithSameName = await AccountModel.findOne({ username, address: { $ne: address } }, { username: 1 }).lean();
  
  if (accountWithSameName)
    return { result: false, error: 'The username is already in use', error_msg: 'The username is already in use' };
  
  return { result: true };
};

const isValidSearch = (searchStr: string): boolean => {
  const format = /[`#@$%^&*()_+\-=\[\]{};':"\\|,.<>\/~]/;
  return !format.test(searchStr);
};

const removeDuplicatedElementsFromArray = <T>(arr: T[]): T[] | undefined => {
  
  if (arr?.length > 0) return arr?.filter((item, index) => arr?.indexOf(item) === index);
  return undefined;
}

const isUserCanAddNewCategory = async (address: string): Promise<boolean> => {
  const stakedBalance = await Balance.findOne({ address, chainId: 56, staked: { $gte: 10_000 } }, { staked: 1 });
  return !!stakedBalance;
};

export {
  removeDuplicatedObject,
  removeDuplicatedElementsFromArray,
  isUnlockedPPVStream,
  isUnlockedLockedContent,
  isValidTipAmount,
  isSupportedChain,
  eligibleBountyForAccount,
  isValidUsername,
  isValidSearch,
  isUserCanAddNewCategory,
};
