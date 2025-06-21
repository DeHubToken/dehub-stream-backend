import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DehubPayService } from './dehub-pay-service';
import { defaultWalletAddress, minGas } from './constants';
import { HttpStatusCode } from 'axios';
import { validatePurchaseInput } from 'common/util/validate-purchase-input';

@Injectable()
export class DehubPayMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DehubPayMiddleware.name);

  constructor(private readonly dehubPayService: DehubPayService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const { errors, validated } = validatePurchaseInput(req.body);

    if (errors.length > 0) {
      const { status, message } = errors[0]; // Respond with the first validation error
      return res.status(status).json({ message });
    }

    const { chainId, tokenSymbol, currency, tokensToReceive, tokenId, currencyLimits, amount } = validated;
    req.body.tokenId = tokenId;
    try {
      const priceData = await this.dehubPayService.coinMarketCapGetPrice(tokenId, currency, amount);
      const tokenPrice = priceData?.price;

      if (!tokenPrice || typeof tokenPrice !== 'number') {
        return res.status(HttpStatusCode.BadRequest).json({ message: 'Token price unavailable.' });
      }

      const requestedFiatValue = tokensToReceive * tokenPrice;

      if (requestedFiatValue < currencyLimits.minLimit) {
        return res.status(HttpStatusCode.NotAcceptable).json({
          message: `Minimum purchase amount is ${currencyLimits.minLimit} ${currency.toUpperCase()}.`,
        });
      }

      if (requestedFiatValue > currencyLimits.maxLimit) {
        return res.status(HttpStatusCode.NotAcceptable).json({
          message: `Maximum purchase amount is ${currencyLimits.maxLimit} ${currency.toUpperCase()}.`,
        });
      }

      const tokens = await this.dehubPayService.checkTokenAvailability(defaultWalletAddress, { skipCache: true });
      const availableTokens = tokens?.[chainId]?.[tokenSymbol];
      if (!availableTokens || tokensToReceive > availableTokens) {
        return res.status(HttpStatusCode.NotAcceptable).json({
          message: 'Requested amount exceeds available token supply.',
        });
      }

      const gas = await this.dehubPayService.checkGasAvailability();

      if (!gas?.[chainId] || gas[chainId] <= minGas[chainId]) {
        return res.status(HttpStatusCode.NotAcceptable).json({
          message: 'Unable to proceed with your request due to low gas on the selected chain.',
        });
      }
      return next();
    } catch (err) {
      console.error('Token purchase validation failed:', err);
      return res.status(HttpStatusCode.InternalServerError).json({
        message: 'Internal error while processing token purchase.',
      });
    }
  }
}
