import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from 'common/guards/auth.guard';
import { PlansService } from './plans.service';
// import { SubscriptionContractService } from './plan.contract.service';

@Controller()
export class PlansController {
  constructor(private readonly plansServices: PlansService) {}

  @Get('/plans/:id')
  async getPlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getPlan(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to fetch plan', error: error.message });
    }
  }

  @Get('/plans')
  async getPlans(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getPlans(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to fetch plans', error: error.message });
    }
  }

  @Post('/plans')
  @UseGuards(AuthGuard)
  async createPlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.createPlan(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to create Plan', error: error.message });
    }
  }
  @Post('/plans/:id')
  @UseGuards(AuthGuard)
  async updatePlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.updatePlan(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to update Plan', error: error.message });
    }
  }
  @Post('/plan/buy')
  @UseGuards(AuthGuard)
  async buyPlan(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.createSubscription(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to update Plan', error: error.message });
    }
  }
  @Get('/subscription/me')
  async getMySubscription(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getMySubscription(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to fetch plans', error: error.message });
    }
  }

  @Get('/subscription/:id')
  async getSubscription(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.getSubscription(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Failed to fetch plans', error: error.message });
    }
  }

  @Post('/plan/webhook/create')
  @UseGuards(AuthGuard)
  async webhookPlanCreate(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.webhookPlanCreate(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'webhook Failed', error: error.message });
    } 
  }
  @Post('/plan/webhook/purchased')
  @UseGuards(AuthGuard)
  async webhookPlanPurchased(@Req() req: Request, @Res() res: Response) {
    try {
      return await this.plansServices.webhookPlanPurchased(req, res);
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'webhook Failed', error: error.message });
    } 
  }
}