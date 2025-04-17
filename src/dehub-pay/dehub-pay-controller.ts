import { Controller, Get, Req, Res, Query, HttpStatus, Post, Body, Logger, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import axios from 'axios';
import { DehubPayService } from './dehub-pay-service';
import { reqParam } from 'common/util/auth';
import mongoose from 'mongoose';
import { DehubPayMiddleware } from './dehub-pay-middleware';

@Controller()
export class DehubPayController {
  private readonly logger = new Logger(DehubPayController.name);
  constructor(private readonly dehubPayService: DehubPayService) {}
  @Get('/dpay/price')
  async getDehubPrice(@Query('currency') currency: string = 'usd', @Res() res: Response) {
    try {
      const data = await this.dehubPayService.coingeckoGetPrice('dehub', currency);
      if (!data.price) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: `Unsupported or invalid currency: ${currency}`,
        });
      }

      return res.status(HttpStatus.OK).json({
        ...data,
        currency: currency.toLowerCase(),
      });
    } catch (err) {
      console.error('[DehubPayController Fetch Error]', err.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to fetch token price',
      });
    }
  }

  @Get('/dpay/available/tokens')
  async getAvailableTokens(@Query('token') token: string = 'dehub', @Res() res: Response) {
    try {
      console.log('dehub', token);
      const balance: any = await this.dehubPayService.checkTokenAvailability();

      return res.status(HttpStatus.OK).json({
        balance,
      });
    } catch (err) {
      console.error('[DehubPayController Fetch Error]', err.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to fetch token price',
      });
    }
  }

  @Get('/dpay/available/gas')
  async getAvailableGas(@Query('token') token: string = 'dehub', @Res() res: Response) {
    try {
      console.log('dehub', token);
      const balance: any = await this.dehubPayService.checkGasAvailability();

      return res.status(HttpStatus.OK).json({
        balance,
      });
    } catch (err) {
      console.error('[DehubPayController Fetch Error]', err.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to fetch token price',
      });
    }
  }

  @Get('/dpay/tnxs')
  async getTnx(@Req() req: Request, @Res() res: Response) {
    try {
      const filter: any = {};
      const address = reqParam(req, 'address');
      const sid = reqParam(req, 'sid');
      if (sid && sid.trim() !== '') {
        filter['$or'] = [{ sessionId: sid }, { _id: new mongoose.Types.ObjectId(sid) }];
      }
      const data = await this.dehubPayService.getTnxs(filter);
      return res.status(HttpStatus.OK).json(data);
    } catch (err) {
      console.error('[DehubPayController Fetch Error]', err.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to fetch tnxs',
      });
    }
  }

  @Post('/dpay/checkout')
  @UseGuards(DehubPayMiddleware)
  async checkout(
    @Body('chainId') chainId: number = 97,
    @Body('address') address: number = 0,
    @Body('receiverAddress') receiverAddress: number = 0,
    @Body('amount') amount: number = 0,
    @Body('tokensToReceive') tokensToReceive: number = 0,
    @Body('redirect') redirect: string = process.env.FRONT_END_URL,
    @Res() res: Response,
  ) {
    try {
      // Log the request
      this.logger.log(`Checkout initiated for token: ${'dehub'}, USD Amount: ${amount}`);

      // Step 1: Get the token price using the DehubPayService

      const { price } = await this.dehubPayService.coingeckoGetPrice('dehub', 'usd');
      if (!price) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: `Price for token '${'dehub'}' not found on CoinGecko`,
        });
      }

      // Step 2: Create Stripe checkout session
      const { id, url } = await this.dehubPayService.checkout({
        chainId,
        address,
        receiverAddress,
        amount,
        tokensToReceive,
        redirect,
      });

      // Step 3: Return the session id and redirect URL
      return res.status(HttpStatus.OK).json({
        message: 'Checkout session created successfully',
        sessionId: id,
        checkoutUrl: url,
        tokenPrice: price,
      });
    } catch (err) {
      this.logger.error('[DehubPayController Error]', err);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to create checkout session',
      });
    }
  }
  @Get('/dpay/success')
  async successCallBack(@Query('sid') sid: string, @Res() res: Response) {
    try {
      this.dehubPayService.successCallBack(sid);
    } catch (error) {}
  }

  @Get('/dpay/cancel')
  async cancelCallBack(@Query('sid') sid: string, @Res() res: Response) {
    try {
      this.dehubPayService.cancelCallBack(sid);
    } catch (error) {}
  }
}
