import { Controller, Get, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from 'common/guards/auth.guard';
import { PlansService } from './plans.service';

@Controller()
export class PlansController {
  constructor(private readonly plansServices: PlansService) {}

  @Get('/plans/:id')
  async getPlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getPlan(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch plan', error: error.message });
    }
  }

  @Get('/plans')
  async getPlans(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getPlans(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch plans', error: error.message });
    }
  }

  @Post('/plans')
  async createPlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.createPlan(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to create Plan', error: error.message });
    }
  }
  @Post('/plans/:id')
  async updatePlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.updatePlan(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to update Plan', error: error.message });
    }
  }
  @Post('/plan/buy')
  async buyPlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.createSubscription(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to update Plan', error: error.message });
    }
  }
  @Get('/subscription/me')
  async getMySubscription(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getMySubscription(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch plans', error: error.message });
    }
  }

  @Get('/subscription/:id')
  async getSubscription(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getSubscription(req, res);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch plans', error: error.message });
    }
  }
}
