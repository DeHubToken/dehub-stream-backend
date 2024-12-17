import { Controller, Get, Post, Req, Res } from '@nestjs/common';
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
      return res.status(500).json({
        message: 'Failed to search users or groups',
        error: error.message,
      });
    }
  }

  @Get('/dm/messages/:id')
  async getMessagesDm(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getMessagesDm(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch messages for the specified user or group',
        error: error.message,
      });
    }
  }

  @Get('/dm/contacts/:address')
  async getContacts(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getContacts(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch contacts for the specified address',
        error: error.message,
      });
    }
  }

  // @Get('/dm/group/:address')
  // async getGroups(@Req() req: Request, @Res() res: Response) {
  //   try {
  //     return await this.dmServices.getGroups(req, res);
  //   } catch (error) {
  //     return res.status(500).json({
  //       message: 'Failed to fetch contacts for the specified address',
  //       error: error.message,
  //     });
  //   }
  // }

  @Post('/dm/group')
  async createGroupChat(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.createGroupChat(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to create the group chat',
        error: error.message,
      });
    }
  }
}
