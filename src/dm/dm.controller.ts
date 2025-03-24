import { Controller, Get, Post, Put, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
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
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to create the group chat',
        error: error.message,
      });
    }
  }

  @Put('/dm/group')
  async updateGroupChat(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.updateGroupChat(req, res);
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to join the group chat',
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
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to get stream',
        error: error.message,
      });
    }
  }

  @Post('/dm/block')
  async blockDm(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.blockDm(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to Block ',
        error: error.message,
      });
    }
  }
  @Post('/dm/group-user-block')
  async blockGroupUser(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.blockGroupUser(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to block Group user.',
        error: error.message,
      });
    }
  }
  @Post('/dm/tnx')
  async addTnx(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.addTnx(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed add tnx.',
        error: error.message,
      });
    }
  }

  @Post('/dm/group-user-exit')
  async exitGroupUser(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.exitGroupUser(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to Exit Group.',
        error: error.message,
      });
    }
  }
  @Put('/dm/tnx')
  async updateTnx(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.dmServices.updateTnx(req, res);
    } catch (error: any & { message: string }) {
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
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to Un Block',
        error: error.message,
      });
    }
  }

  @Post("/dm/user-status/:address")
  async UserDMStatus(@Req() req: Request, @Res() res: Response){
    try {
      return await this.dmServices.updateDmUserStatus(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to Disable Status',
        error: error.message,
      });
    }
  }
  @Get("/dm/user-status/:address")
  async getUserDMStatus(@Req() req: Request, @Res() res: Response){
    try {
      return await this.dmServices.getUserDMStatus(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to Disable Status',
        error: error.message,
      });
    }
  }

  @Post("/dm/delete-messages")
  async deleteAllMessagesOneSide(@Req() req: Request, @Res() res: Response){
    try {
      return await this.dmServices.deleteAllMessagesOneSide(req, res);
    } catch (error: any & { message: string }) {
      return res.status(500).json({
        message: 'Failed to Delete Messages',
        error: error.message,
      });
    }
  }
}
