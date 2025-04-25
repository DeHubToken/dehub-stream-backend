import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getERC20TokenBalance } from 'common/util/web3';
import { config } from 'config';
import { ChainId, supportedNetworks, supportedTokens } from 'config/constants';
import { ethers } from 'ethers';
import Redis from 'ioredis';
import { AccountModel } from 'models/Account';
import { DpayTnxModel } from 'models/dpay/dpay-transactions';
import mongoose from 'mongoose';
import { Request, Response } from 'express';

import Stripe from 'stripe';
import { first } from 'rxjs';
import { defaultWalletAddress } from './constants';
import { TicketModel } from 'models/dpay/ticket-model';

@Injectable()
export class DehubPayService {
  private readonly logger = new Logger(DehubPayService.name);
  private readonly stripe: Stripe;
  private redisClient: Redis;
  protected endpointSecret = process.env.END_POINT_SECRET_KEY ?? '';
  constructor() {
    this.redisClient = new Redis({ ...config.redis, db: 3 });
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-03-31.basil',
    });
  }
  async getTnxs(filter) {
    try {
      const transactions = await DpayTnxModel.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        {
          $project: {
            _id: 1,
            sessionId: 1,
            amount: 1,
            tokenSymbol: 1,
            tokenAddress: 1,
            chainId: 1,
            status_stripe: 1,
            txnHash: 1,
            note: 1,
            type: 1,
            currency: 1,
            tokenSendStatus: 1,
            tokenSendRetryCount: 1,
            receiverAddress: 1,
            tokenSendTxnHash: 1,
            approxTokensToReceive: 1,
            approxTokensToSent: 1,
            lastTriedAt: 1,
            createdAt: 1,
            updatedAt: 1,
            receiverId: 1,
          },
        },
      ]);

      return transactions;
    } catch (error) {
      this.logger.error('Error fetching transactions:', error.message);
      throw new Error('Failed to fetch transactions');
    }
  }
  async getTnxsApi(filter, page = 1, limit = 10, cache = true) {
    try {
      const skip = (page - 1) * limit;
      const cacheKey = `transactions:${JSON.stringify(filter)}:page:${page}:limit:${limit}`;

      if (cache) {
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const [transactions, total] = await Promise.all([
        DpayTnxModel.aggregate([
          { $match: filter },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              sessionId: 1,
              amount: 1,
              tokenSymbol: 1,
              tokenAddress: 1,
              chainId: 1,
              status_stripe: 1,
              txnHash: 1,
              note: 1,
              type: 1,
              currency: 1,
              tokenSendStatus: 1,
              tokenSendRetryCount: 1,
              receiverAddress: 1,
              tokenSendTxnHash: 1,
              approxTokensToReceive: 1,
              approxTokensToSent: 1,
              lastTriedAt: 1,
              createdAt: 1,
              updatedAt: 1,
              receiverId: 1,
            },
          },
        ]),
        DpayTnxModel.countDocuments(filter),
      ]);

      const result = {
        tnxs: transactions,
        total,
        page,
        limit,
      };

      await this.redisClient.setex(cacheKey, 60, JSON.stringify(result)); // 60 seconds cache

      return result;
    } catch (error) {
      this.logger.error('Error fetching transactions:', error.message);
      throw new Error('Failed to fetch transactions');
    }
  }
  async checkout({
    chainId,
    address,
    receiverAddress,
    amount,
    tokensToReceive,
    redirect,
    tokenSymbol,
    currency,
    tokenId,
  }) {
    try {
      const user = await AccountModel.findOne({ address: address.toLowerCase() });
      if (!user) {
        throw new Error('User not Found.');
      }
      const timestep = Date.now(); // or your preferred unique timestamp
      const transaction = new DpayTnxModel({
        sessionId: `temp+${Math.random() * 100}-${timestep}`, // temp placeholder
        amount,
        currency,
        tokenSymbol,
        chainId,
        receiverId: user._id,
        status_stripe: 'init',
        type: 'buy_token',
        receiverAddress,
        approxTokensToReceive: tokensToReceive,
      });

      await transaction.save();

      const session = await this.createStripeSession(
        tokenSymbol,
        tokenId,
        currency,
        amount,
        transaction._id.toString(),
        redirect,
      );
      transaction.sessionId = session.id;
      transaction.status_stripe = 'pending';
      await transaction.save(); // Save updated fields

      return { id: session.id, url: session.url };
    } catch (error) {
      this.logger.error('Error during checkout process', error.message);
      throw error;
    }
  }
  async createStripeSession(
    token: string,
    tokenId: string,
    currency: string,
    localAmount: number,
    id: string,
    redirect?: string,
  ) {
    try {
      // Fetch token price from Coingecko or your pricing service
      const { price: tokenPrice } = await this.coingeckoGetPrice(tokenId, currency);

      if (!tokenPrice) {
        throw new Error(`Failed to fetch price for ${token}`);
      }

      // Calculate approximate tokens user will receive
      const approxTokensToReceive = localAmount / tokenPrice;
      console.log('approxTokensToReceive', approxTokensToReceive);
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: `${token} Token Purchase`,
                description: `Approx. ${approxTokensToReceive.toFixed(2)} ${token} tokens`,
                images: ['https://dehub.io/icons/DHB.png'],
              },
              unit_amount: Math.round(localAmount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${redirect ?? process.env.FRONT_END_URL}/dpay/tnx/${id}`,
        cancel_url: `${redirect ?? process.env.FRONT_END_URL}/dpay/tnx/${id}`,
        metadata: {
          token,
          id,
          amount: localAmount.toString(),
          approxTokensToReceive: approxTokensToReceive.toString(),
        },
        custom_text: {
          submit: {
            message: 'Click to confirm your token purchase',
          },
          terms_of_service_acceptance: {
            message: "By continuing, you agree to DeHub's token terms and conditions.",
          },
        },
        consent_collection: {
          terms_of_service: 'required',
        },
      });

      return session;
    } catch (error) {
      this.logger.error('Error creating Stripe session', error.message);
      this.logger.error('Error creating Stripe session', error);
      throw new Error('Failed to create Stripe checkout session');
    }
  }
  async stripeWebHook(request, res) {
    let event = request.body;
    if (this.endpointSecret) {
      // Get the signature sent by Stripe
      const signature = request.headers['stripe-signature'];
      try {
        event = this.stripe.webhooks.constructEvent(request.body, signature, this.endpointSecret);

        // Handle the event
        switch (event.type) {
          case 'payment_intent.created':
            const createdIntent = event.data.object;
            console.log(`🟡 PaymentIntent created: ${createdIntent.id}`, createdIntent);
            this.handlePaymentIntentCreated(createdIntent);
            break;

          case 'payment_intent.succeeded':
            const succeededIntent = event.data.object;
            console.log(`✅ PaymentIntent succeeded for amount: ${succeededIntent.amount}`);
            this.handlePaymentIntentSucceeded(succeededIntent);
            break;

          case 'payment_intent.payment_failed':
            const failedIntent = event.data.object;
            console.log(`❌ PaymentIntent failed: ${failedIntent.last_payment_error?.message}`);
            this.handlePaymentIntentFailed(failedIntent);
            break;

          case 'charge.succeeded':
            const successfulCharge = event.data.object;
            console.log(`💰 Charge succeeded for amount: ${successfulCharge.amount}`);
            this.handleChargeSucceeded(successfulCharge);
            break;

          case 'charge.failed':
            const failedCharge = event.data.object;
            console.log(`❌ Charge failed: ${failedCharge.failure_message}`);
            this.handleChargeFailed(failedCharge);
            break;

          case 'charge.refunded':
            const refundedCharge = event.data.object;
            console.log(`↩️ Charge refunded: ${refundedCharge.id}`);
            this.handleChargeRefunded(refundedCharge);
            break;

          case 'payment_method.attached':
            const attachedPaymentMethod = event.data.object;
            console.log(`🔗 Payment method attached: ${attachedPaymentMethod.id}`);
            this.handlePaymentMethodAttached(attachedPaymentMethod);
            break;

          default:
            console.log(`⚠️ Unhandled event type: ${event.type}`);
        }

        // Return a 200 response to acknowledge receipt of the event
        res.send();
      } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`, err.message);
        return res.sendStatus(400);
      }
    }
  }
  async coingeckoGetPrice(tokenSymbol: string, currency: string, chainId?: number) {
    try {
      const cacheKey = `coingecko:price:${tokenSymbol}:${currency}`;
      const cachedPrice = await this.redisClient.get(cacheKey);
      if (cachedPrice) {
        return JSON.parse(cachedPrice);
      }

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${tokenSymbol}&vs_currencies=${currency.toLowerCase()}`,
      );

      const price = response.data?.[tokenSymbol]?.[currency.toLowerCase()] ?? 0;

      if (price === 0) {
        throw new Error(`Price not found for ${tokenSymbol} in ${currency}`);
      }

      const priceData = { price, tokenSymbol, currency };

      // Cache the price for 10 minutes
      await this.redisClient.setex(cacheKey, 600, JSON.stringify(priceData));

      return priceData;
    } catch (error) {
      this.logger.error(`Error fetching price for ${tokenSymbol} in ${currency}: ${error.message}`);
      throw error;
    }
  }
  async getTokenContractAndPlatform(chainId: number | string, token: string) {
    let numericChainId = typeof chainId !== 'number' ? parseInt(chainId, 10) : chainId;

    const platformMap: Record<number, string> = {
      [ChainId.BSC_MAINNET]: 'binance-smart-chain',
      [ChainId.BASE_MAINNET]: 'base',
    };
    const chainMap: Record<string, number> = {
      'binance-smart-chain': ChainId.BSC_MAINNET,
      base: ChainId.BASE_MAINNET,
    };
    const tokenInfo = supportedTokens.find(t => t.chainId === numericChainId && t.symbol === token);

    return {
      platformId: platformMap[chainId],
      contractAddress: tokenInfo.address,
      chain: chainMap[platformMap[chainId]],
    };
  }
  async fetchPriceByChain(platformId: string, contractAddress: string, chainId: number) {
    const cacheKey = `coingecko:price:${platformId}:${contractAddress}`;
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platformId}?contract_addresses=${contractAddress}&vs_currencies=usd`;

    try {
      const cachedPrice = await this.redisClient.get(cacheKey);
      if (cachedPrice) {
        return JSON.parse(cachedPrice);
      }
      const res = await fetch(url);
      const data = await res.json();
      const price = data[contractAddress.toLowerCase()]?.usd ?? 0;
      const priceData = { platform: platformId, price, url, chainId };
      await this.redisClient.setex(cacheKey, 100, JSON.stringify(priceData));

      return priceData;
    } catch (err) {
      console.error(`Error fetching price for ${platformId}:`, err);
      return { platform: platformId, price: 0, url };
    }
  }
  async checkTokenAvailability(address: string = defaultWalletAddress, options = { skipCache: false }) {
    try {
      const cacheKey = `tokenBalances:${address.toLowerCase()}`;
      const cachedBalances = await this.redisClient.get(cacheKey);
      if (!options.skipCache && cachedBalances) {
        return JSON.parse(cachedBalances);
      }

      const balancePromises = await Promise.all(
        supportedTokens
          .filter(
            t =>
              [ChainId.BSC_MAINNET, ChainId.BSC_TESTNET, ChainId.BASE_MAINNET].includes(t.chainId) &&
              t.symbol === 'DHB',
          )
          .map(async token => {
            try {
              const balance = await getERC20TokenBalance(address, token.address, token.chainId);
              return { chainId: token.chainId, symbol: token.symbol, balance };
            } catch (error) {
              console.log(error);
              this.logger?.warn?.(`Error fetching ${token.symbol} balance on chain ${token.chainId}: ${error.message}`);
              return { chainId: token.chainId, symbol: token.symbol, balance: 0 };
            }
          }),
      );

      const results = await Promise.all(balancePromises);
      const groupedBalances = this.groupBalancesByChain(results);

      // Cache the result for 1 hour
      await this.redisClient.setex(cacheKey, 60, JSON.stringify(groupedBalances));

      return groupedBalances;
    } catch (error) {
      this.logger.error('Error checking token availability', error.message);
      throw new Error('Failed to check token availability');
    }
  }
  async checkGasAvailability(address: string = defaultWalletAddress, options = { skipCache: false }) {
    try {
      const cacheKey = `gasBalances:${address.toLowerCase()}`;
      const cachedGasBalances = await this.redisClient.get(cacheKey);
      if (!options.skipCache && cachedGasBalances) {
        return JSON.parse(cachedGasBalances);
      }

      const gasBalancePromises = supportedNetworks.map(async network => {
        const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);

        try {
          const rawBalance = await provider.getBalance(address);
          const balance = Number(ethers.formatEther(rawBalance));
          return { chainId: network.chainId, nativeSymbol: network?.shortName, balance };
        } catch (error) {
          this.logger.warn(`Error fetching native balance on chain ${network.chainId}: ${error.message}`);
          return { chainId: network.chainId, nativeSymbol: network?.shortName, balance: 0 };
        }
      });

      const results = await Promise.all(gasBalancePromises);
      const formattedBalances = this.formatGasBalances(results);

      // Cache the result for 1 hour
      await this.redisClient.setex(cacheKey, 60, JSON.stringify(formattedBalances));

      return formattedBalances;
    } catch (error) {
      this.logger.error('Error checking gas availability', error.message);
      throw new Error('Failed to check gas availability');
    }
  }
  groupBalancesByChain(results: { chainId: number; symbol: string; balance: number }[]) {
    return results.reduce((acc, { chainId, symbol, balance }) => {
      if (!acc[chainId]) acc[chainId] = {};
      acc[chainId][symbol] = balance;
      return acc;
    }, {});
  }
  formatGasBalances(results: { chainId: number; nativeSymbol: string; balance: number }[]) {
    return results.reduce((acc, { chainId, nativeSymbol, balance }) => {
      acc[chainId] = { [nativeSymbol]: balance };
      return acc;
    }, {});
  }
  async verifyTransactionStatus(sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error verifying transaction:', error.message);
      return false;
    }
  }
  async getTransferDetailsBySessionId(sessionId: string) {
    const transaction = await DpayTnxModel.findOne({ sessionId }).lean();

    if (!transaction) {
      return null;
    }

    return {
      receiverAddress: transaction.receiverAddress,
      amount: transaction.amount,
      tokenAddress: transaction.tokenAddress,
      chainId: transaction.chainId,
      createdAt: transaction.createdAt,
    };
  }
  async updateTransactionStatus(sessionId: string, status_stripe: string): Promise<any> {
    if (status_stripe == 'failed') {
      return DpayTnxModel.updateOne({ sessionId }, { $set: { status_stripe, tokenSendStatus: 'cancelled' } });
    }
    return await DpayTnxModel.updateOne({ sessionId }, { $set: { status_stripe } });
  }
  async getTransactionBySessionId(sessionId: string) {
    return DpayTnxModel.findOne({ sessionId });
  }
  async updateTokenSendStatus(sessionId: string, updates: Partial<any>) {
    return DpayTnxModel.updateOne({ sessionId }, { $set: updates });
  }
  async handlePaymentIntentCreated(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handlePaymentIntentCreated Session Id not Attached');
      return;
    }
    await DpayTnxModel.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          intentId: intent.id,
          isIntentCreated: true,
        },
      },
      { new: true },
    );
  }
  async handlePaymentIntentSucceeded(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    const tnx = await DpayTnxModel.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          status_stripe: intent.status,
        },
      },
      { new: true },
    );
    console.log({ sessionId, intent, tnx });

    console.log('handlePaymentIntentSucceeded sessionId', sessionId);
  }
  // Handling Payment Intent Failed
  async handlePaymentIntentFailed(intent) {
    try {
      const sessionId = await this.getStripeSession(intent.id);
      if (!sessionId) {
        console.log('handlePaymentIntentFailed: Session ID not found');
        return;
      }

      // Update transaction status to reflect failure
      const tnx = await DpayTnxModel.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            status_stripe: intent.status,
            payment_status: 'failed', // Mark payment as failed
            failure_reason: intent.last_payment_error?.message || 'Unknown error', // Include any failure reason
          },
        },
        { new: true },
      );
      console.log('Payment Intent Failed', { sessionId, intent, tnx });
    } catch (error) {
      console.error('Error in handlePaymentIntentFailed:', error);
    }
  }
  async handleChargeSucceeded(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handleChargeSucceeded Session Id not Attached');
    }

    console.log('handleChargeSucceeded sessionId', sessionId);
  }
  async handleChargeFailed(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handleChargeFailed Session Id not Attached');
    }

    console.log('handleChargeFailed sessionId', sessionId);
  }
  async handleChargeRefunded(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handleChargeRefunded Session Id not Attached');
    }

    console.log('handleChargeRefunded sessionId', sessionId);
  }
  async handlePaymentMethodAttached(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handlePaymentMethodAttached Session Id not Attached');
    }

    console.log('handlePaymentMethodAttached sessionId', sessionId);
  }
  async getStripeSession(paymentIntentId: string): Promise<string | null> {
    'use strict';
    try {
      // Retrieve the Checkout Session associated with the payment intent
      const sessions = await this.stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
      });
      return sessions.data[0]?.id;
    } catch (error) {
      this.logger.warn('No linked Checkout Session found for PaymentIntent:', paymentIntentId);
      return null;
    }
  }
  async createOnrampSession(req, res) {
    try {
      const { transaction_details } = req.body;
      const OnrampSessionResource = Stripe.StripeResource.extend({
        create: Stripe.StripeResource.method({
          method: 'POST',
          path: 'crypto/onramp_sessions',
        }),
      });
      // Create an OnrampSession with the order amount and currency
      const onrampSession: any = await new OnrampSessionResource(this.stripe).create({
        transaction_details: {
          destination_currency: transaction_details['destination_currency'],
          destination_exchange_amount: transaction_details['destination_exchange_amount'],
          destination_network: transaction_details['destination_network'],
        },
        customer_ip_address: req.socket.remoteAddress,
      });

      res.send({
        clientSecret: onrampSession.client_secret,
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }
  async getPendingEstimatedAmountToTransfer() {
    const pipeline: any = [
      {
        $match: {
          tokenSendStatus: { $in: ['pending', 'processing'] },
        },
      },
      {
        $project: {
          chainId: 1,
          tokenSymbol: 1,
          approxTokensToReceiveNum: { $toDouble: '$approxTokensToReceive' },
        },
      },
      {
        $group: {
          _id: {
            chainId: '$chainId',
            tokenSymbol: '$tokenSymbol',
          },
          chainId: { $first: '$chainId' },
          tokenSymbol: { $first: '$tokenSymbol' },
          total: { $sum: '$approxTokensToReceiveNum' },
        },
      },
      {
        $project: {
          _id: 0,
          chainId: 1,
          tokenSymbol: 1,
          total: 1,
        },
      },
    ];

    return await DpayTnxModel.aggregate(pipeline);
  }
  async getSuccessAmountToTransferred() {
    const pipeline: any = [
      {
        $match: {
          tokenSendStatus: { $in: ['sent'] },
        },
      },
      {
        $project: {
          chainId: 1,
          tokenSymbol: 1,
          approxTokensToSentNum: { $toDouble: '$approxTokensToSent' },
        },
      },
      {
        $group: {
          _id: {
            chainId: '$chainId',
            tokenSymbol: '$tokenSymbol',
          },
          chainId: { $first: '$chainId' },
          tokenSymbol: { $first: '$tokenSymbol' },
          total: { $sum: '$approxTokensToSentNum' },
        },
      },
      {
        $project: {
          _id: 0,
          chainId: 1,
          tokenSymbol: 1,
          total: 1,
        },
      },
    ];

    const res = await DpayTnxModel.aggregate(pipeline);
    return res;
  }
  async createTicket(ticketData: {
    chainId: number;
    address: string;
    description: string;
    type: string;
    requestType: string;
  }) {
    try {
      // Simulating some database or external API interaction
      const { chainId, address, type, description, requestType } = ticketData;

      // Example: Save the ticket data to the database or process it
      const newTicket = await TicketModel.create({
        chainId,
        address,
        type,
        description,
        requestType,
        status: 'pending', // Example status
        createdAt: new Date(),
      });

      // Return the created ticket or any relevant information
      return newTicket;
    } catch (error) {
      // Handle errors (e.g., logging or throwing a custom error)
      console.error('Error creating ticket:', error);
      throw new Error('Failed to create ticket');
    }
  }

  // async getTokenBehind(chainId: number, tokenSymbol: string) {
  //   let tempChainId = chainId;
  //   if (chainId === 97) {
  //     tempChainId = 56;
  //   }
  //   const platform = await this.getTokenContractAndPlatform(tempChainId, tokenSymbol);
  //   const tokens = await this.checkTokenAvailability(defaultWalletAddress, { skipCache: true });
  //   const gas = await this.checkGasAvailability(defaultWalletAddress, { skipCache: true });
  //   const data = await this.fetchPriceByChain(platform.platformId, platform.contractAddress, tempChainId);
  //   return { ...data, tokens, gas, tokenSymbol };
  // }
}
