import { Controller, Get, Req, Res, Query, HttpStatus, Post, Body, Logger, UseGuards, Param } from '@nestjs/common';
import { Request, Response } from 'express';
import { DehubPayService } from './dehub-pay-service';
import { reqParam } from 'common/util/auth';
import mongoose from 'mongoose';
import { symbolToIdMap } from './constants';

@Controller()
export class DehubPayController {
  private readonly logger = new Logger(DehubPayController.name);
  constructor(private readonly dehubPayService: DehubPayService) {}
  @Get('/dpay/price')
  async getDehubPrice(
    @Query('currency') currency: string = 'usd',
    @Query('chainId') chainId: number = 56,
    @Res() res: Response,
  ) {
    try {
      const data = await this.dehubPayService.coingeckoGetPrice(symbolToIdMap['DHB'], currency, chainId);
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
      const sid = reqParam(req, 'sid');
      if (sid && sid.trim() !== '') {
        const orConditions = [];

        if (mongoose.Types.ObjectId.isValid(sid)) {
          orConditions.push({ _id: new mongoose.Types.ObjectId(sid) });
        }

        orConditions.push({ sessionId: sid });

        filter['$or'] = orConditions;
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const data = await this.dehubPayService.getTnxsApi(filter, page, limit);
      return res.status(HttpStatus.OK).json(data);
    } catch (err) {
      console.error('[DehubPayController Fetch Error]', err.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to fetch tnxs',
      });
    }
  }
  @Post('/dpay/checkout')
  // @UseGuards(AuthGuard)
  async checkout(
    @Body('chainId') chainId: number = null,
    @Body('address') address: string = null,
    @Body('currency') currency: string = null,
    @Body('tokenId') tokenId: string = 'DHB',
    @Body('tokenSymbol') tokenSymbol: string = 'DHB',
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
        tokenSymbol,
        currency,
        tokenId,
      });

      // Step 3: Return the session id and redirect URL
      return res.status(HttpStatus.OK).json({
        message: 'Checkout session created successfully',
        sessionId: id,
        checkoutUrl: url,
        tokenPrice: price,
      });
    } catch (err) {
      console.error(err);
      this.logger.error('[DehubPayController Error]', err);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to create checkout session',
      });
    }
  }
  @Post('/dpay/tk/')
  createTicket(
    @Body('tnxId') chainId: number = null,
    @Body('address') address: string = null,
    @Body('description') description: string = null,
    @Body('type') type: string = null,
    @Body('requestType') requestType: string = null,
    @Res() res: Response,
  ) {
    try {
      // Ensure the data passed is valid before calling the service
      if (!chainId || !address || !type || !description || !requestType) {
        return res.status(400).json({ message: 'Missing required parameters.' });
      }

      // Pass the data to the service
      const ticketData = {
        chainId,
        address,
        description,
        type,
        requestType,
      };

      // Create the ticket using the service
      const result = this.dehubPayService.createTicket(ticketData);

      // Send a response back to the client
      return res.status(201).json(result);
    } catch (error) {
      // Handle errors and send back a response
      console.error(error);
      return res.status(500).json({ message: 'An error occurred while creating the ticket.' });
    }
  }

  @Post('/dpay/webhook')
  stripeWebHook(@Req() req: Request, @Res() res: Response) {
    try {
      return this.dehubPayService.stripeWebHook(req, res);
    } catch (error) {
      throw new Error(error.message);
    }
  }
  @Post('dpay/create-onramp-session')
  async createOnrampSession(@Req() req: Request, @Res() res: Response) {
    try {
      return this.dehubPayService.createOnrampSession(req, res);
    } catch (error) {
      throw Error(error.message);
    }
  }
  @Get('/dpay/price/:chainId')
  async fetchPriceByChain(@Param('chainId') chainId: string, @Query('token') token = 'DHB', @Res() res: Response) {
    try {
      const platform = await this.dehubPayService.getTokenContractAndPlatform(chainId, token);
      const data = await this.dehubPayService.fetchPriceByChain(
        platform.platformId,
        platform.contractAddress,
        platform.chain,
      );
      return res.status(200).json(data);
    } catch (error) {
      this.logger.error('[DehubPayController Error]', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error.message,
      });
    }
  }

  @Get('/dpay/total')
  async fetchTotal(@Query('type') type = 'success', @Res() res: Response) {
    try {
      const obj = {
        success: this.dehubPayService.getSuccessAmountToTransferred,
        pending: this.dehubPayService.getPendingEstimatedAmountToTransfer,
      };

      return res.status(HttpStatus.OK).json((await obj[type]()) ?? {});
    } catch (error) {
      this.logger.error('[DehubPayController Error]', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error.message,
      });
    }
  }
}
