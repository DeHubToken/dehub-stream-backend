import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AccountModel } from 'models/Account';
import { LiveStream } from 'models/LiveStream';
import { SearchQuery } from 'models/SearchQuery';
import { VoteModel } from 'models/Vote';
import { Model } from 'mongoose';
import { NftService } from 'src/nft/nft.service';

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
      livestreams = await this.livestreamModel
        .find({ $or: [{ title: regex }, { description: regex }] })
        .sort({ createdAt: -1 })
        .skip(page * unit)
        .limit(unit);
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
