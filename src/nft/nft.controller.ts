import { Controller, Get, Post, Req, Res, UploadedFiles, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from 'common/guards/auth.guard';
import { NftService } from './nft.service';

@Controller()
export class NFTController {
  constructor(private readonly nftServices: NftService) {}

  @Get('getServerTime')
  getServerTime(@Res() res: Response) {
    return res.json({ status: true, data: Math.floor(Date.now() / 1000), note: 's' });
  }

  @Get('all_nfts')
  async getAllNfts(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getAllNfts(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }
  @Get('search_nfts')
  async Filtered(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getFilteredNfts(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }

  @Get('my_nfts')
  async myNfts(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getMyNfts(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }

  @Post('token_visibility')
  async changeVisibility(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.updateTokenVisibility(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }

  @Get('my_watched_nfts')
  async watchhistory(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getMyWatchedNfts(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }
  @Get('get_categories')
  async getCat(@Res() res: Response) {
    try {
      return await this.nftServices.getCategories(res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch Categories', error: error.message });
    }
  }

  @Get('/claim_bounty')
  async claimBounty(@Req() req: Request, @Res() res: Response) {
    return await this.nftServices.getSignForClaimBounty(req, res);
  }

  @Post('user_mint')
  @UseGuards(AuthGuard)
  async userMint(@Req() req: Request, @Res() res: Response, @UploadedFiles() files?: Express.Multer.File[]) {
    const { postType = 'video' } = req.body;
    if (postType != 'feed-simple' && (!files || files.length === 0)) {
      return res.status(400).json({ message: 'No files provided for minting' });
    }
    const { address, name, description, streamInfo, chainId, category,plans } = req.body;

    try {
      const nft = await this.nftServices.mintNFT(
        name,
        description,
        JSON.parse(streamInfo),
        address,
        chainId,
        category,
        postType,JSON.parse(plans),
        files,
      );
      return res.json(nft);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to mint NFT', error: error.message });
    }
  }

  @Get('liked_videos')
  @UseGuards(AuthGuard)
  async getLikedVideos(@Req() req: Request, @Res() res: Response) {
    const resp = await this.nftServices.getlikedVideos(req, res);
    res.send(resp);
  }

  @Get('/nft_info/:id')
  async nftinfo(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getNftInfo(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }

  @Get('/nfts/images/:id') 
  async nftImage(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getNftImage(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }
  @Get('/unlocked_nfts/:id')
  async unlockedNft(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.nftServices.getUnlockedNfts(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }
}
