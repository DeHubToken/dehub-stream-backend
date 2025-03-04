import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { TransactionModel } from 'models/PaymentTransactions';
import * as crypto from 'crypto';

@Injectable()
export class BuySellCryptoService {
  async buyCrypto(req: Request) {
    const { currencyCode, walletAddress, baseCurrencyAmount, baseCurrencyCode } = req.body;

    const moonpayParams = {
      apiKey: process.env.MOONPAY_API_KEY,
      currencyCode,
      walletAddress,
      baseCurrencyAmount,
      baseCurrencyCode,
      redirectURL: 'http://localhost:3000/buy-crypto',
    };

    try {
      // Use new Function to force a runtime dynamic import rather than a transpiled require()
      const moonpayModule = await new Function('return import("@moonpay/moonpay-node")')();
      const { MoonPay } = moonpayModule;
      const moonPayInstance = new MoonPay(process.env.MOONPAY_SECRET_KEY);

      const url = moonPayInstance.url.generate({
        flow: 'buy',
        params: moonpayParams,
      });
      const signature = moonPayInstance.url.generateSignature(url);
      return `${url}&signature=${signature}`;
    } catch (error) {
      console.error('Error generating MoonPay URL:', error);
      throw new Error('Failed to generate MoonPay URL');
    }
  }

  async sellCrypto(req: Request) {
    const { defaultBaseCurrencyCode, baseCurrencyAmount, quoteCurrencyCode, walletAddress } = req.body;

    const moonpayParams = {
      apiKey: process.env.MOONPAY_API_KEY,
      defaultBaseCurrencyCode,
      baseCurrencyAmount,
      quoteCurrencyCode,
      walletAddress,
      redirectURL: 'http://localhost:3000/sell-crypto',
    };

    try {
      // Use new Function to force a runtime dynamic import rather than a transpiled require()
      const moonpayModule = await new Function('return import("@moonpay/moonpay-node")')();
      const { MoonPay } = moonpayModule;
      const moonPayInstance = new MoonPay(process.env.MOONPAY_SECRET_KEY);

      const url = moonPayInstance.url.generate({
        flow: 'sell',
        params: moonpayParams,
      });

      const signature = moonPayInstance.url.generateSignature(url);
      return `${url}&signature=${signature}`;
    } catch (error) {
      console.error('Error generating MoonPay URL:', error);
      throw new Error('Failed to generate MoonPay URL');
    }
  }

  async verifyMoonpayWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<boolean> {
    try {
      let secret = process.env.MOONPAY_WEBHOOK_SECRET?.trim();
      if (!secret) {
        console.error('MoonPay webhook secret is not defined');
        return false;
      }

      // Strip the prefix (e.g., "wk_test_" or "wk_live_") if present
      secret = secret.replace(/^wk_test_/, '').replace(/^wk_live_/, '');

      // Parse the header. Expected format: "t=TIMESTAMP,s=SIGNATURE"
      const parts = signatureHeader.split(',');
      const timestampPart = parts.find((p) => p.startsWith('t='));
      const signaturePart = parts.find((p) => p.startsWith('s='));
      if (!timestampPart || !signaturePart) {
        console.error('Invalid signature header format');
        return false;
      }
      const timestamp = timestampPart.split('=')[1];
      const expectedSignature = signaturePart.split('=')[1];

      // Prepare the payload to sign: "<timestamp>.<rawBody>"
      const payloadToSign = `${timestamp}.${rawBody.toString('utf8')}`;

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payloadToSign);
      const computedSignature = hmac.digest('hex');

      return computedSignature === expectedSignature;
    } catch (error) {
      return false;
    }
  }


  async saveTransactionDetails(eventData: any): Promise<void> {
    try {
      const transactionId = eventData.data.id;
      const status = eventData.data.status;
      if (!transactionId || !status) return;

      // Determine and normalize the transaction type
      let transactionType = eventData.data.flow ? eventData.data.flow.toLowerCase() : 'buy';
      if (transactionType === 'principal') {
        transactionType = 'buy';
      } else if (transactionType === 'floating') {
        transactionType = 'sell';
      }

      // Get the wallet address depending on the transaction type
      let walletAddress: string | null = null;
      if (transactionType === 'sell') {
        walletAddress = eventData.data.depositWallet?.walletAddress;
      } else {
        walletAddress = eventData.data.walletAddress || eventData.data.customer?.walletAddress;
      }

      if (!walletAddress) {
        console.warn(`No wallet address provided for transaction ${transactionId}`);
        walletAddress = 'N/A';
      }

      let accountId = null;
      if (transactionType === 'sell') {
        accountId = eventData.data.accountId || null;
      }
      else {
        if (walletAddress && walletAddress !== 'N/A') {
          const account = await AccountModel.findOne({ address: walletAddress });
          if (account) {
            accountId = account._id;
          }
        }
      }

      const existingTransaction = await TransactionModel.findOne({ transactionId });
      if (existingTransaction) {
        if (existingTransaction.status !== status || (accountId && !existingTransaction.account)) {
          existingTransaction.status = status;
          existingTransaction.data = eventData;
          if (accountId) {
            existingTransaction.account = accountId;
          }
          existingTransaction.transactionType = transactionType;
          existingTransaction.updatedAt = new Date();
          await existingTransaction.save();
        } else {
          console.log(`Transaction ${transactionId} status is unchanged: ${status}`);
        }
      } else {
        // Create a new record
        const newTransaction = new TransactionModel({
          transactionId: transactionId,
          status: status,
          data: eventData,
          account: accountId,
          address: walletAddress,
          transactionType: transactionType
        });
        await newTransaction.save();
        console.log(`Saved new transaction ${transactionId} with status: ${status}`);
      }
    } catch (error) {
      console.error('Error saving transaction to database:', error);
    }
  }
}
