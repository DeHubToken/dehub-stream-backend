import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AccountModel } from 'models/Account';
import { LiveStream } from 'models/LiveStream';
import { SearchQuery } from 'models/SearchQuery';
import { VoteModel } from 'models/Vote';
import { Model } from 'mongoose';
import { NftService } from 'src/nft/nft.service';
import { Balance } from 'models/Balance';
import { maxStaked } from 'common/util/validation';

@Injectable()
export class SearchQueryService {
  constructor(
    @InjectModel(SearchQuery.name)
    private searchModel: Model<SearchQuery>,
    @InjectModel(LiveStream.name) private livestreamModel: Model<LiveStream>,
    private readonly nftService: NftService,
  ) {}

  async logSearch(term: string, address?: string): Promise<void> {
    if (!term) return;
    const normalized = term.trim().toLowerCase();
    await this.searchModel.findOneAndUpdate(
      { term: normalized },
      //   { term: normalized, address },
      { $inc: { count: 1 }, lastSearchedAt: new Date() },
      { upsert: true, new: true },
    );
  }

  // Get suggestions by prefix
  async getSuggestions(prefix: string, limit = 5): Promise<string[]> {
    const normalized = prefix.trim().toLowerCase();
    const results = await this.searchModel
      .find({ term: { $regex: '^' + normalized } })
      .sort({ count: -1, lastSearchedAt: -1 })
      .limit(limit)
      .exec();

    return results.map(r => r.term);
  }

  async searchAll({
    search,
    page = 0,
    unit = 20,
    type, // <-- optional
    address,
    postType = 'video',
  }: {
    search: string;
    page?: number;
    unit?: number;
    type?: 'accounts' | 'livestreams' | 'videos';
    address?: string;
    postType?: string;
  }) {
    const regex = new RegExp(search, 'i');

    // 🔹 Default empty
    let accounts: any = [];
    let livestreams: any = [];
    let videos: any = [];

    // --- Accounts ---
    if (!type || type === 'accounts') {
      accounts = await AccountModel.find({ username: regex })
        .skip(page * unit)
        .limit(unit);
    }

    // --- Livestreams ---
    if (!type || type === 'livestreams') {
      const rawStreams = await this.livestreamModel
        .find({ $or: [{ title: regex }, { description: regex }] })
        .sort({ createdAt: -1 })
        .skip(page * unit)
        .limit(unit);

      const addresses = rawStreams
        .map(s => (s as any)?.address?.toLowerCase())
        .filter((a): a is string => Boolean(a));

      // Fetch related accounts in one query
      const relatedAccounts = await AccountModel.find({ address: { $in: addresses } }).lean();
      const accountByAddress = new Map<string, any>(
        relatedAccounts.map(a => [a.address?.toLowerCase(), a]),
      );

      // Fetch balances for all addresses and compute max staked per address
      const balances = await Balance.find(
        { address: { $in: addresses } },
        { address: 1, staked: 1, _id: 0 },
      ).lean();
      const byAddr: Record<string, any[]> = {};
      for (const b of balances) {
        const addr = (b as any).address?.toLowerCase();
        if (!addr) continue;
        (byAddr[addr] ||= []).push(b);
      }
      const stakedByAddress = new Map<string, number>();
      for (const addr of Object.keys(byAddr)) {
        stakedByAddress.set(addr, maxStaked(byAddr[addr]));
      }

      livestreams = rawStreams.map(stream => {
        const addr = (stream as any)?.address?.toLowerCase();
        const account = addr ? accountByAddress.get(addr) : undefined;
        const minterStaked = addr ? stakedByAddress.get(addr) ?? 0 : 0;
        return {
          ...stream.toObject(),
          minterStaked,
          account: account
            ? {
                username: account.username,
                displayName: account.displayName,
                avatarImageUrl: account.avatarImageUrl,
              }
            : null,
        };
      });
    }

    // --- Videos ---
    if (!type || type === 'videos') {
      const postFilter: any = {};
      const contentFilter: Record<string, any> = {
        video: { $or: [{ postType: { $nin: ['feed-simple', 'feed-images', 'live'] } }] },
        'feed-all': { $or: [{ postType: 'feed-simple' }, { postType: 'feed-images' }] },
        feed: { $or: [{ postType: 'feed-simple' }, { postType: 'feed-images' }] },
        'feed-images': { postType: 'feed-images' },
        'feed-simple': { postType: 'feed-simple' },
      };
      if (contentFilter[postType]) Object.assign(postFilter, contentFilter[postType]);

      // Build pipeline $match similar to nft.service searchQuery
      const searchQuery: any = {
        $match: {
          $and: [{ status: 'minted' }, { $or: [{ isHidden: false }, { isHidden: { $exists: false } }] }, postFilter],
        },
      };

      const textFilter = { $or: [{ name: regex }, { description: regex }, { owner: regex }] };

      videos = await this.nftService.getStreamNfts(textFilter, page * unit, unit, { createdAt: -1 }, address, [
        searchQuery,
      ]);

      // Batch like/dislike calculation (avoid N+1)
      if (address && Array.isArray(videos) && videos.length) {
        const tokenIds = videos.map(v => v.tokenId).filter(Boolean);
        const votes = await VoteModel.find(
          { tokenId: { $in: tokenIds }, address },
          { tokenId: 1, vote: 1, _id: 0 },
        ).lean();
        const voteMap = new Map<number, boolean>();
        votes.forEach(v => voteMap.set(v.tokenId as any, v.vote));
        videos.forEach(v => {
          const vote = voteMap.get(v.tokenId);
          v.isLiked = vote === true;
          v.isDisliked = vote === false;
        });
      } else if (Array.isArray(videos)) {
        videos.forEach(v => {
          v.isLiked = false;
          v.isDisliked = false;
        });
      }
    }

    return { accounts, livestreams, videos };
  }
}
