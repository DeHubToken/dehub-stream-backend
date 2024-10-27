import { BadRequestException, Controller, Get, Post, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AssetService } from './asset.service';
import { Request, Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller()
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Post('chat-image')
  @UseInterceptors(FilesInterceptor('images', 5))
  async uploadChatImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No images provided');
    }
    return this.assetService.handleImageUpload(files);
  }

  @Get('video/:id')
  findOne(@Req() req: Request, res:Response) {
    return this.assetService.getStream(req, res)
  }

  @Get('nft_metadata/:id')
  fintMeta(@Req() req: Request, res:Response) {
    return this.assetService.getMetaData(req, res)
  }

  @Get('images/:id')
  findImage(@Req() req: Request, res:Response) {
    return this.assetService.getImage(req, res)
  }

  @Get('covers/:id')
  findCover(@Req() req: Request, res:Response) {
    return this.assetService.getCover(req, res)
  }

  @Get('avatars/:id')
  findAvatar(@Req() req: Request, res:Response) {
    return this.assetService.getCover(req, res)
  }

  
}
