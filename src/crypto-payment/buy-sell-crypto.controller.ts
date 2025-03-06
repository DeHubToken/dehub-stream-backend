import { Controller, HttpStatus, Post, Req, Res, Headers, Get, Param } from '@nestjs/common';
import { BuySellCryptoService } from './buy-sell-crypto.service';
import { Request, Response } from 'express';
import TransactionModel from 'models/Transaction';

@Controller()
export class BuySellCryptoController {

  constructor(private readonly buySellCryptoService: BuySellCryptoService) { }

  @Post('/buy-crypto')
  async buyCryptoMoonpayUrl(@Req() req: Request, @Res() res: Response) {
    try {
      const url = await this.buySellCryptoService.buyCrypto(req);
      return res.status(HttpStatus.OK).json({ url });
    } catch (error) {
      console.error('Error generating MoonPay URL:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to generate MoonPay URL' });
    }
  }

  @Post('/sell-crypto')
  async sellCryptoMoonpayUrl(@Req() req: Request, @Res() res: Response) {
    try {
      
      const url = await this.buySellCryptoService.sellCrypto(req);
      return res.status(HttpStatus.OK).json({ url });
    } catch (error) {
      console.error('Error generating MoonPay URL:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to generate MoonPay URL' });
    }
  }

  @Post('/moonpay/webhook')
  async moonpayWebhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('moonpay-signature') signatureHeader: string, @Res() res: Response) {
    try {

      const rawBody = req.rawBody || Buffer.from('');

      const isValid = await this.buySellCryptoService.verifyMoonpayWebhookSignature(
        rawBody,
        signatureHeader,
      );
      if (!isValid) {
        return res.status(HttpStatus.BAD_REQUEST).send('Invalid signature');
      }

      const eventData = req.body;
      // Save the transaction details (and account reference if available)
      await this.buySellCryptoService.saveTransactionDetails(eventData);

      return res.status(HttpStatus.OK).send('Webhook processed');
    } catch (error) {
      console.error('Error handling MoonPay webhook:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Webhook error');
    }
  }
}
