import { Controller, Get, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'; 
import { DMService } from './dm.service'; 
import { Request, Response } from 'express';
@Controller() 
export class DMController {
  constructor(private readonly dmServices: DMService) {}

  @Get('/dm/search')
  async searchDm(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.searchUserOrGroup(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch users or groups', error: error.message });
    }
  }

  @Get('/dm/messages/:id') 
  async getMessagesDm(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getMessagesDm(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch users or groups', error: error.message });
    }
  }
 
}
