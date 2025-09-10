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
  }: {
    search: string;
    page?: number;
    unit?: number;
    type?: 'accounts' | 'livestreams' | 'videos';
    address?: string;
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
      videos = await this.nftService.getStreamNfts(
        { $or: [{ name: regex }, { description: regex }, { owner: regex }] },
        page * unit,
        unit,
        { createdAt: -1 },
        address,
      );

      // Add `isLiked` check
      if (address) {
        for (let video of videos) {
          const userLike = await VoteModel.findOne({
            tokenId: video.tokenId,
            address,
          });
          video.isLiked = Boolean(userLike);
        }
      }
    }

    return { accounts, livestreams, videos };
  }
}
