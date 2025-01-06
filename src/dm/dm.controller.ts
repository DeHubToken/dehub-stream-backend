import { Controller, Get, Post, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { DMService } from './dm.service';
import { Request, Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

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
  @Get('/dm/:id')
  async getContact(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getContact(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch messages for the specified user or group',
        error: error.message,
      });
    }
  }
  @Get('/dm/plan/:planId')
  async getContactByPlanId(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getContactByPlanId(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch messages for the specified user or group',
        error: error.message,
      });
    }
  }

  @Get('/dm/contacts/:address')
  async getContactsByAddress(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getContactsByAddress(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch contacts for the specified address',
        error: error.message,
      });
    }
  }
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
  @Post('/dm/group/join')
  async joinGroup(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.joinGroup(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to create the group chat',
        error: error.message,
      });
    }
  }
  @Post('/dm/upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'files', maxCount: 5 }, // Adjust the name and max count as per your requirement
    ]),
  )
  async uploadDm(@Req() req: Request, @Res() res: Response, @UploadedFiles() files: { files: Express.Multer.File[] }) {
    try {
      // console.log('files', files); // Check the received files here
      return await this.dmServices.uploadDm(req, res, files);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to create the group chat',
        error: error.message,
      });
    }
  }
  @Get('/dm/dm-videos')
  async getVideosStream(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.getVideoStream(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to search users or groups',
        error: error.message,
      });
    }
  }

  @Post('/dm/block')
  async blockDm(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.blockDm(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to search users or groups',
        error: error.message,
      });
    }
  }
  @Post('/dm/group-user-block')
  async blockGroupUser(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.blockGroupUser(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to search users or groups',
        error: error.message,
      });
    }
  }
  @Post('/dm/tnx')
  async addTnx(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.addTnx(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed add tnx.',
        error: error.message,
      });
    }
  }
  @Get('/dm/un-block/:conversationId')
  async unBlock(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.unBlockDm(req, res);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to search users or groups',
        error: error.message,
      });
    }
  }
}
