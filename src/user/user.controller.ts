import { Controller, Get, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from 'common/guards/auth.guard';
import { UserService } from './user.service';

@Controller()
export class UserController {
  constructor(private readonly userServices: UserService) {}

  @Get('/account_info/:id')
  async accountInfo(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.userServices.getAccountInfo(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to fetch NFTs', error: error.message });
    }
  }

  @Post('/update_profile')
  @UseGuards(AuthGuard)
  async updateProfile(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
    @Res() res: Response
  ) {
    try {
      const coverImage = files.find(file => file.fieldname === 'coverImg') || null;
      const avatarImage = files.find(file => file.fieldname === 'avatarImg') || null;
      console.log(coverImage, avatarImage);


      // Forward the request, including any uploaded files, to your service
      return await this.userServices.updateProfile(req, res, coverImage, avatarImage);
    } catch (error: any & { message: string }) {
      console.log(error);
      return res.status(500).json({ message: 'Failed to update profile', error: error.message });
    }
  }

  @Get('/usernames')
  async getUsernames(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.userServices.getUsernames();
      return res.json(result);
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to fetch usernames', error: error.message });
    }
  }

  @Get('/users_count')
  async getNumberOfUsers(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.userServices.getNumberOfUsers();
      return res.json(result);
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to fetch users count', error: error.message });
    }
  }

  @Get('/users_search')
  async searchUsers(@Req() req: Request, @Res() res: Response) {
    try {
      await this.userServices.searchUsers(req, res); 
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to search users', error: error.message });
    }
  }

  @Get('/is_valid_username')
  async isValidUsername(@Req() req: Request, @Res() res: Response) {
    try {
      const { username, address }:any = req.query;
      console.log(req.query)
      const validation = await this.userServices.isValidUsername(address, username);
      return res.json(validation);
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to validate username', error: error.message });
    }
  }

  @Get('/is_following')
  @UseGuards(AuthGuard)
  async isFollowing(@Req() req: Request, @Res() res: Response) {
    // AuthGuard sets req.user.address
    const followerAddress = (req as any)?.user?.address;
    const target = (req.query?.target as string) || (req.query?.address as string);
    if (!target) return res.status(400).json({ result: false, error: 'target address is required' });

    try {
      const result = await this.userServices.isFollowing(followerAddress, target);
      return res.json({ result });
    } catch (error: any & { message: string }) {
      return res.status(500).json({ message: 'Failed to check following', error: error.message });
    }
  }
}
