import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { normalizeAddress } from 'common/util/format';
import { eligibleBountyForAccount, isValidUsername } from 'common/util/validation';
import { editableProfileKeys, overrideOptions, paramNames, userProfileKeys } from 'config/constants';
import { isAddress } from 'ethers';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { Balance } from 'models/Balance';
import { Feature } from 'models/Feature';
import { Follow } from 'models/Follow';
import { PPVTransactionModel } from 'models/PPVTransaction';
import sharp from 'sharp';
import { ActivityService } from 'src/activity/activity.service';
import { CdnService } from 'src/cdn/cdn.service';

const accountTemplate = {
  username: 1,
  displayName: 1,
  balance: 1,
  address: 1,
  // deposited: 1,
  [userProfileKeys.avatarImageUrl]: 1,
  [userProfileKeys.coverImageUrl]: 1,
  [userProfileKeys.username]: 1,
  [userProfileKeys.aboutMe]: 1,
  [userProfileKeys.email]: 1,
  [userProfileKeys.facebookLink]: 1,
  [userProfileKeys.twitterLink]: 1,
  [userProfileKeys.discordLink]: 1,
  [userProfileKeys.instagramLink]: 1,
  [userProfileKeys.tiktokLink]: 1,
  [userProfileKeys.telegramLink]: 1,
  [userProfileKeys.youtubeLink]: 1,
  createdAt: 1,
  sentTips: 1,
  receivedTips: 1,
  uploads: 1,
  customs: 1,
  _id: 0,
};

@Injectable()
export class UserService {
  private activityService: ActivityService = new ActivityService();
  constructor(private readonly cdnService: CdnService) {}

  async getAccountInfo(req: Request, res: Response) {
    /// walletAddress param can be username or address
    let walletAddress: any = req.query.id || req.query.id || req.params?.id;
    if (!walletAddress) return res.status(400).json({ error: 'Bad request: No wallet sent' });
    walletAddress = normalizeAddress(walletAddress);
    let accountInfo: any = await AccountModel.findOne(
      { $or: [{ address: walletAddress }, { username: walletAddress }] },
      accountTemplate,
    ).lean();
    const balanceData = await Balance.find(
      { address: accountInfo?.address?.toLowerCase() },
      { chainId: 1, tokenAddress: 1, walletBalance: 1, staked: 1, _id: 0 },
    );
    if (!balanceData?.length && !accountInfo && !isAddress(walletAddress)) {
      return res.status(404).json({ error: 'Not Found: Account not found', result: false });
    } else if (accountInfo) {
      walletAddress = accountInfo?.address;
    } else {
      accountInfo = {};
    }
    const unlockedPPVStreams = await PPVTransactionModel.find(
      { address: walletAddress }, // No expiry
      // { address: walletAddress, createdAt: { $gt: new Date(Date.now() - config.availableTimeForPPVStream) } },
      { streamTokenId: 1 },
    ).distinct('streamTokenId');
    accountInfo.balanceData = balanceData.filter(e => e.walletBalance > 0 || e.staked > 0);
    accountInfo.unlocked = unlockedPPVStreams;
    accountInfo.likes = await Feature.find({ address: walletAddress }, {}).distinct('tokenId');
    accountInfo.followings = await this.getFollowing(walletAddress);
    accountInfo.followers = await this.getFollowers(walletAddress);
    return res.json({ result: accountInfo });
  }

  /** DON'T USE THIS FUNCTION
   * Get user account details by address
   * Optimized single function for fast lookups
   */
  async getUserDetails(address: string): Promise<any> {
    if (!address) {
      throw new Error('Address is required');
    }

    const normalizedAddress = normalizeAddress(address);

    // Determine if this is an address or username
    const isEthAddress = isAddress(normalizedAddress);

    const accountInfo = await AccountModel.findOne(
      isEthAddress
        ? { address: normalizedAddress }
        : { $or: [{ address: normalizedAddress }, { username: normalizedAddress }] },
      {
        _id: 1,
        address: 1,
        username: 1,
        displayName: 1,
        avatarImageUrl: 1,
        coverImageUrl: 1,
        aboutMe: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ).lean();

    if (!accountInfo) {
      return null;
    }

    // Get all required data in parallel for best performance
    const [balanceData, unlockedPPVStreams, likes, followings, followers] = await Promise.all([
      Balance.find(
        { address: accountInfo.address },
        { chainId: 1, tokenAddress: 1, walletBalance: 1, staked: 1, _id: 0 },
      ),

      PPVTransactionModel.find({ address: accountInfo.address }, { streamTokenId: 1 }).distinct('streamTokenId'),

      Feature.find({ address: accountInfo.address }, {}).distinct('tokenId'),

      Follow.find({ address: accountInfo.address }, { following: 1 }).distinct('following'),

      Follow.find({ following: accountInfo.address }, { address: 1 }).distinct('address'),
    ]);

    return {
      ...accountInfo,
      balanceData: balanceData.filter(e => e.walletBalance > 0 || e.staked > 0),
      unlocked: unlockedPPVStreams,
      likes,
      followings,
      followers,
    };
  }

  /**
   * Get just the essential user details (lightweight version)
   * Perfect for embedding in other objects like meta
   */
  async getEssentialUserDetails(address: string): Promise<any> {
    if (!address) {
      return null;
    }

    const normalizedAddress = normalizeAddress(address);

    const accountInfo = await AccountModel.findOne(
      { address: normalizedAddress },
      {
        _id: 1,
        address: 1,
        username: 1,
        displayName: 1,
        avatarImageUrl: 1,
        followers: 1,
        createdAt: 1,
        aboutMe: 1,
      },
    ).lean();

    if (!accountInfo) {
      return null;
    }

    // Get staked balance - the only balance we need for essentials
    const stakedBalance = await Balance.findOne(
      {
        address: normalizedAddress,
        tokenAddress: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d',
      },
      { staked: 1 },
    );

    return {
      ...accountInfo,
      staked: stakedBalance?.staked || 0,
    };
  }

  async updateProfile(req: Request, res: Response, coverImage, avatarImage) {
    try {
      let address = reqParam(req, paramNames.address);
      address = normalizeAddress(address);

      // Build $set and $unset for PATCH semantics
      const setOps: Record<string, any> = {};
      const unsetOps: Record<string, ''> = {};

      // Handle editable fields
      Object.entries(editableProfileKeys).forEach(([, profileKey]) => {
        let rawVal = reqParam(req, profileKey);

        // If field is not present in the request at all => do not modify
        if (typeof rawVal === 'undefined') {
          return;
        }

        // Special handling for 'customs'
        if (profileKey === 'customs') {
          try {
            if (rawVal) {
              rawVal = JSON.parse(rawVal);
              Object.keys(rawVal).forEach(key => {
                if (!(Number(key) >= 1 && Number(key) <= 5)) delete rawVal[key];
              });
            }
          } catch {
            // Bad JSON => ignore this field rather than breaking the whole update
            return;
          }
        }

        // Treat explicit clear signals as unset
        const isClear = rawVal === null || rawVal === '' || rawVal === 'null' || rawVal === 'NULL';

        if (isClear) {
          // do not accidentally unset username via empty value
          if (profileKey !== 'username') {
            unsetOps[profileKey] = '';
          }
          return;
        }

        // Normal set
        setOps[profileKey] = rawVal;
      });

      // Validate and update username only if explicitly provided and non-empty
      let username = reqParam(req, userProfileKeys.username);
      if (typeof username !== 'undefined' && username !== null && `${username}`.trim() !== '') {
        username = `${username}`.toLowerCase();
        const validation = await isValidUsername(address, username);
        if (validation.error) return res.json(validation);
        setOps[userProfileKeys.username] = username;
      }

      // File upload handling with cdnService (only if files are sent)
      const coverImgFile = coverImage;
      const avatarImgFile = avatarImage;

      if (coverImgFile) {
        const coverImagePath = await this.cdnService.uploadFile(
          coverImgFile.buffer,
          'covers',
          normalizeAddress(address) + '.jpg',
        );
        setOps[userProfileKeys.coverImageUrl] = coverImagePath;
      }

      if (avatarImgFile) {
        const avatarImagePath = await this.cdnService.uploadFile(
          avatarImgFile.buffer,
          'avatars',
          normalizeAddress(address) + '.jpg',
        );
        setOps[userProfileKeys.avatarImageUrl] = avatarImagePath;
      }

      // Build update document
      const updateDoc: any = {};
      if (Object.keys(setOps).length) updateDoc.$set = setOps;
      if (Object.keys(unsetOps).length) updateDoc.$unset = unsetOps;

      // Nothing to update
      if (!Object.keys(updateDoc).length) {
        return res.json({ result: true });
      }

      // Apply update
      // const updatedAccount = await AccountModel.findOneAndUpdate(
      //   { address: address.toLowerCase() },
      //   updateDoc,
      //   { ...overrideOptions, new: true, upsert: false, runValidators: true },
      // );

      const updatedAccount = await AccountModel.findOneAndUpdate(
        { address: address.toLowerCase() },
        {
          ...(Object.keys(setOps).length ? { $set: setOps } : {}),
          ...(Object.keys(unsetOps).length ? { $unset: unsetOps } : {}),
          $setOnInsert: {
            address: address.toLowerCase(),
            createdAt: new Date(),
            // optional defaults to mirror mobileAuth:
            sentTips: 0,
            receivedTips: 0,
            uploads: 0,
            followers: 0,
            likes: 0,
            customs: {},
            online: true,
            seenModal: false,
          },
        },
        { ...overrideOptions, new: true, upsert: true, runValidators: true },
      );

      // Auto-generate username only if displayName just got set and username is still missing
      if (updatedAccount?.displayName && !updatedAccount.username) {
        let base = updatedAccount.displayName.toLowerCase().replace(/\s+/g, '_');
        let tail = 0;
        for (let i = 0; i < 10000; i++) {
          const candidate = tail === 0 ? base : `${base}_${tail}`;
          const validation = await isValidUsername(address, candidate);
          if (validation.result) {
            await AccountModel.updateOne({ address }, { $set: { username: candidate } });
            break;
          }
          tail++;
        }
      }

      return res.json({ result: true });
    } catch (error: any & { message: string }) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
  }

  async requestFollow(address, following) {
    following = normalizeAddress(following);
    if (address === following) throw new BadRequestException("Can't follow yourself");
    const updatedResult: any = await Follow.updateOne({ address, following }, {}, overrideOptions);
    this.activityService.onFollowAndUnFollow({ address, following }, true);
    if (updatedResult?.nModified > 0) throw new ConflictException('Already following user');
    return { result: updatedResult };
  }

  async unFollow(address, following) {
    following = normalizeAddress(following);
    const deletedResult = await Follow.deleteOne({ address, following });
    if (deletedResult?.deletedCount > 0) {
      this.activityService.onFollowAndUnFollow({ address, following }, false);

      return { result: true };
    }
    throw new ConflictException('Not following user');
  }

  async getFollowing(address) {
    address = normalizeAddress(address);
    const followes = Follow.find({ address }, { following: 1 }).distinct('following');
    return followes;
  }

  async getFollowers(address) {
    address = normalizeAddress(address);
    const followes = Follow.find({ following: address }, { address: 1 }).distinct('address');
    return followes;
  }

  async getUsernames() {
    try {
      const result = await AccountModel.find({}, { username: 1 }).distinct('username');
      return { result };
    } catch (error: any & { message: string }) {
      console.error('-----request getUsernames error', error);
      throw new Error('Failed to fetch usernames');
    }
  }

  async publicAccountData(req: Request, res: Response) {
    const addressList = reqParam(req, 'addressList');
    if (!addressList || addressList.length < 1)
      return res.status(400).json({ result: false, error: 'Bad Request: Address List is required' });
    try {
      const accountTemplate = {
        _id: 0,
        address: 1,
        username: 1,
        displayName: 1,
        avatarImageUrl: 1,
      };
      return res.json({ result: await AccountModel.find({ address: { $in: addressList } }, accountTemplate) });
    } catch (error: any & { message: string }) {
      console.log('-----public account data', error);
      return res.status(500).json({ result: false, error: error.message || 'Could not fetch account data' });
    }
  }

  async getNumberOfUsers() {
    try {
      const userCount = await AccountModel.countDocuments({});
      return { result: userCount };
    } catch (error: any & { message: string }) {
      console.error('Error getting user count:', error.message);
      throw new Error('Internal Server Error');
    }
  }

  async searchUsers(req: Request, res: Response) {
    try {
      const { searchParam } = req.query;

      const filter: any = {};
      if (searchParam) {
        filter.username = { $regex: searchParam, $options: 'i' };
      }
      const users = await AccountModel.find(filter).limit(10);
      return res.send({ result: users });
    } catch (error: any & { message: string }) {
      console.error('Error searching for users:', error.message);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }

  async isValidUsername(address: string, username: string) {
    try {
      const normalizedAddress = normalizeAddress(address);
      const normalizedUsername = normalizeAddress(username);
      const validationResult = await isValidUsername(normalizedAddress, normalizedUsername);
      return { result: validationResult };
    } catch (error: any & { message: string }) {
      console.error('-----validate username error', error);
      throw new Error('Could not validate username');
    }
  }
}
