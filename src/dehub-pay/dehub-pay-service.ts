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
  async getTnxs(filter, line = []) {
    try {
      const pipeline = [
        { $match: filter },
        { $sort: { createdAt: -1 } },

        ...line,
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
            tokenReceived: 1,
            lastTriedAt: 1,
            createdAt: 1,
            updatedAt: 1,
            receiverId: 1,
          },
        },
      ];
      const transactions = await DpayTnxModel.aggregate(pipeline);

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
              net: 1,
              fee: 1,
              exchange_rate: 1,
              currency: 1,
              tokenSendStatus: 1,
              tokenSendRetryCount: 1,
              receiverAddress: 1,
              stripe_hooks:1,
              tokenSendTxnHash: 1,
              ethSendTxnHash: 1,
              approxTokensToReceive: 1,
              tokenReceived: 1,
              ethToSent: 1,
              ethSendStatus: 1,
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

      await this.redisClient.setex(cacheKey, 30, JSON.stringify(result)); // 30 seconds cache

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
      const expireInMinutesFromNow = Math.floor(Date.now() / 1000) + 30 * 60;
      const session = await this.createStripeSession(
        tokenSymbol,
        tokenId,
        currency,
        amount,
        transaction._id.toString(),
        expireInMinutesFromNow,
        redirect,
      );
      transaction.sessionId = session.id;
      transaction.status_stripe = 'pending';
      transaction.expires_at = expireInMinutesFromNow;
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
    expireInMinutesFromNow: number,
    redirect?: string,
  ) {
    try {
      // Fetch token price from Coingecko or your pricing service
      const { price: tokenPrice } = await this.coinMarketCapGetPrice(tokenId, currency, localAmount);

      if (!tokenPrice) {
        throw new Error(`Failed to fetch price for ${token}`);
      }

      // Calculate approximate tokens user will receive
      const approxTokensToReceive = localAmount / tokenPrice;
      const fee = approxTokensToReceive * 0.1; // 10% fee
      const netTokens = approxTokensToReceive - fee;
      console.log('approxTokensToReceive', netTokens);
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: `${token} Token Purchase`,
                description: `Approx. ${netTokens.toFixed(2)} ${token} tokens`,
                images: ['https://dehub.io/icons/DHB.png'],
              },
              unit_amount: Math.round(localAmount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        expires_at: expireInMinutesFromNow, // ⏰ expires
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
          case 'checkout.session.completed':
            const sessionCompleted = event.data.object;
            this.handleCheckoutSessionCompleted(sessionCompleted);
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
        console.log('WEBHOOK', 'ID:', 'HOOK', event.type, event.data.object.id, 'Status: ', event.data.object.status);
        const sessionId = await this.getStripeSession(event.data.object.id);
        const updateData = {};
        updateData[event.type] = event.data.object.status;

        await DpayTnxModel.findOneAndUpdate(
          { $or: [{ sessionId }, { sessionId: event.data.object.id }] },
          {
            $push: {
              stripe_hooks: updateData,
            },
          },
          { new: true },
        );
        // Return a 200 response to acknowledge receipt of the event
        res.send();
      } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`, err.message);
        return res.sendStatus(400);
      }
    }
  }
  async stripeLatestCharge(balanceTransactionId: string) {
    const balanceTransaction = await this.stripe.balanceTransactions.retrieve(balanceTransactionId);
    // console.log('Gross Amount (before fee):', balanceTransaction.amount / 100);
    // console.log('Fee taken by Stripe:', balanceTransaction.fee / 100);
    // console.log('Net Amount (after fee):', balanceTransaction.net / 100);
    // console.log('Transaction Currency:', balanceTransaction.currency);
    // console.log('Exchange Rate (USD -> GBP):', balanceTransaction.exchange_rate);
    return balanceTransaction;
  }
  async getStripeSessionId(sessionId) {
    console.log('getStripeSessionId(sessionId)', sessionId);
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return session;
  }
  async getStripeIntent(intent_id) {
    console.log("getStripeIntent(intent_id)",intent_id)
    const intent = await this.stripe.paymentIntents.retrieve(intent_id);
    console.log('INTENT:', intent);
    return intent;
  }
  async getStripeLatestChargeId(sessionId) {
    console.log('getStripeLatestChargeId(sessionId)', sessionId);
    const intent_id = (await this.getStripeSessionId(sessionId)).payment_intent;
    const latest_charge = (await this.getStripeIntent(intent_id)).latest_charge;
    return latest_charge;
  }
  async getBalanceTransaction(latest_charge: string) {
    const charge = await this.stripe.charges.retrieve(latest_charge);
    const balanceTransactionId = charge.balance_transaction as string;
    return { balanceTransactionId, ...charge };
  }
  async stripeLatestChargeByIntentOrSessionId(id: string) {
    const tnx = await DpayTnxModel.findOne(
      { $or: [{ sessionId: id }, { intentId: id }] },
      { latest_charge: 1, _id: 1 },
    ).lean();
    const balanceTnx = await this.getBalanceTransaction(tnx.latest_charge);
    const balanceChargeTnx = await this.stripeLatestCharge(balanceTnx.balanceTransactionId);
    return { ...balanceChargeTnx };
  }
  async coingeckoGetPrice(tokenSymbol: string, currency: string, amount?: number, chainId?: number) {
    try {
      const cacheKey = `coingecko:price:${tokenSymbol}:${currency}:amount:${amount}`;
      const cachedPrice = await this.redisClient.get(cacheKey);
      if (cachedPrice) {
        return JSON.parse(cachedPrice);
      }

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${tokenSymbol}&vs_currencies=${currency.toLowerCase()}`,
      );
  const chainGasSymbol = {
        [ChainId.BASE_MAINNET]: 'base',
        [ChainId.BSC_MAINNET]: 'binancecoin',
        [ChainId.BSC_TESTNET]: 'binancecoin',
      };
      if(chainGasSymbol[chainId]){
        
      }
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

  async coinMarketCapGetPrice(tokenSymbol: string, currency: string, amount?: number, chainId?: number) {
    try {
      const cacheKey = `coingecko:price:${tokenSymbol}:${currency}:amount:${amount}`;
      const cachedPrice = await this.redisClient.get(cacheKey);
      if (cachedPrice) {
        return JSON.parse(cachedPrice);
      } 
      const response = await await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
        headers: {
          'X-CMC_PRO_API_KEY': process.env.X_CMC_PRO_API_KEY,
          Accept: 'application/json',
        },
        params: {
          symbol: tokenSymbol,
          convert: currency.toLowerCase(),
        },
      });
      const price = response.data.data?.[tokenSymbol]?.quote[currency.toUpperCase()].price ?? 0;

      if (price === 0) {
        throw new Error(`Price not found for ${tokenSymbol} in ${currency}`);
      }

      const priceData = { price, tokenSymbol, currency };

      // Cache the price for 10 minutes
      await this.redisClient.setex(cacheKey, 600, JSON.stringify(priceData));

      return priceData;
    } catch (error) {
      console.log(error);
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
              [
                // ChainId.BSC_MAINNET,
                ChainId.BSC_TESTNET,
                ChainId.BASE_MAINNET,
              ].includes(t.chainId) && t.symbol === 'DHB',
          )
          .map(async token => {
            try {
              const balance = await getERC20TokenBalance(address, token.address, token.chainId);
              return { chainId: token.chainId, symbol: token.symbol, balance, account: address };
            } catch (error) {
              console.log(error);
              this.logger?.warn?.(`Error fetching ${token.symbol} balance on chain ${token.chainId}: ${error.message}`);
              return { chainId: token.chainId, symbol: token.symbol, balance: 0, account: address };
            }
          }),
      );

      const results = await Promise.all(balancePromises);
      const groupedBalances = await this.groupBalancesByChain(results);
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
      const formattedBalances = await this.formatGasBalances(results);

      // Cache the result for 1 hour
      await this.redisClient.setex(cacheKey, 60, JSON.stringify(formattedBalances));

      return formattedBalances;
    } catch (error) {
      this.logger.error('Error checking gas availability', error.message);
      throw new Error('Failed to check gas availability');
    }
  }
  async groupBalancesByChain(results: { chainId: number; symbol: string; balance: number; account: string }[]) {
    return results.reduce((acc, { chainId, symbol, balance, account }) => {
      if (!acc[chainId]) acc[chainId] = {};
      acc[chainId][symbol] = balance;
      // acc[chainId]['account'] = account;
      return acc;
    }, {});
  }
  async formatGasBalances(results: { chainId: number; nativeSymbol: string; balance: number }[]) {
    return results.reduce((acc, { chainId, nativeSymbol, balance }) => {
      acc[chainId] = balance;
      return acc;
    }, {});
  }
  async verifyTransactionStatus(sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      console.log('session', session);
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
  async updateTransaction(sessionId: string, updates): Promise<any> {
    return await DpayTnxModel.updateOne({ sessionId }, { $set: { ...updates } });
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
      { $or: [{ sessionId }, { sessionId: intent.id }] },
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
      { $or: [{ sessionId }, { sessionId: intent.id }] },
      {
        $set: {
          status_stripe: intent.status,
          latest_charge: intent.latest_charge,
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
        { $or: [{ sessionId }, { sessionId: intent.id }] },
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
    DpayTnxModel.findOneAndUpdate(
      { $or: [{ sessionId }, { sessionId: intent.id }] },
      { $set: { isChargeSucceeded: true } },
    );
    console.log('handleChargeSucceeded sessionId', sessionId);
  }
  async handleChargeFailed(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handleChargeFailed Session Id not Attached');
    }
    DpayTnxModel.findOneAndUpdate(
      { $or: [{ sessionId }, { sessionId: intent.id }] },
      { $set: { isChargeFailed: true } },
    );
    console.log('handleChargeFailed sessionId', sessionId);
  }
  async handleChargeRefunded(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handleChargeRefunded Session Id not Attached');
    }
    DpayTnxModel.findOneAndUpdate(
      { $or: [{ sessionId }, { sessionId: intent.id }] },
      { $set: { isChargeRefunded: true } },
    );

    console.log('handleChargeRefunded sessionId', sessionId);
  }
  async handlePaymentMethodAttached(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    if (!sessionId) {
      // throw Error('Session Id Required');
      console.log('handlePaymentMethodAttached Session Id not Attached');
    }
    DpayTnxModel.findOneAndUpdate(
      { $or: [{ sessionId }, { sessionId: intent.id }] },
      { $set: { idPaymentMethodAttached: true } },
    );
    console.log('handlePaymentMethodAttached sessionId', sessionId);
  }
  async handleCheckoutSessionCompleted(intent) {
    const sessionId = await this.getStripeSession(intent.id);
    // getStripeIntent()
    console.log('handleCheckoutSessionCompleted', intent);
    const latest_charge = await this.getStripeLatestChargeId(intent.id);
    const tnx = await DpayTnxModel.findOneAndUpdate(
      { $or: [{ sessionId }, { sessionId: intent.id }] },
      {
        $set: {
          status_stripe: intent.status,
          latest_charge: latest_charge,
        },
      },
      { new: true },
    );
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
      console.log('A');
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const stripeCrypto = new Stripe(stripeSecretKey, {
        apiVersion: '2025-03-31.basil',
      });
      console.log('B');

      const OnrampSessionResource = Stripe.StripeResource.extend({
        create: Stripe.StripeResource.method({
          method: 'POST',
          path: 'crypto/onramp_sessions',
        }),
      });
      console.log('C');

      // Create an OnrampSession with the order amount and currency
      const onrampSession: any = await new OnrampSessionResource(stripeCrypto).create({
        transaction_details: {
          destination_currency: transaction_details['destination_currency'],
          destination_exchange_amount: transaction_details['destination_exchange_amount'],
          destination_network: transaction_details['destination_network'],
        },
        customer_ip_address: req.socket.remoteAddress,
      });
      console.log('D');

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
          tokenReceivedNum: { $toDouble: '$tokenReceived' },
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
          total: { $sum: '$tokenReceivedNum' },
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

  async fetchStripeExchangeRate(sourceCurrency: string, destinationCurrency: string) {
    try {
      const data = [
        `to_currency=${encodeURIComponent(destinationCurrency)}`,
        `from_currencies[]=${encodeURIComponent(sourceCurrency)}`,
        `lock_duration=hour`,
      ].join('&');

      const response = await axios.post('https://api.stripe.com/v1/fx_quotes', data, {
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Stripe-Version': '2025-02-24.acacia;fx_quote_preview=v1',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        maxBodyLength: Infinity,
      });

      const quote = response.data;
      return quote;
    } catch (error) {
      console.error('Error fetching FX quote:', error?.response?.data || error.message);
      throw new Error('Could not fetch FX quote from Stripe');
    }
  }
  calculateGBPFromQuote({ amount, sourceCurrency, quote }: { amount?: number; sourceCurrency: string; quote: any }) {
    const rateInfo = quote.rates[sourceCurrency];

    if (!rateInfo) {
      throw new Error(`Rate for currency ${sourceCurrency} not found in quote.`);
    }

    const { exchange_rate, rate_details } = rateInfo;
    const fxFeeRate = rate_details.fx_fee_rate || 0;

    const grossGBP = amount * exchange_rate;
    const fxFeeAmount = grossGBP * fxFeeRate;
    const netGBP = grossGBP - fxFeeAmount;

    return {
      sourceAmount: amount,
      sourceCurrency,
      exchangeRate: exchange_rate,
      fxFeeRate,
      grossGBP: parseFloat(grossGBP.toFixed(6)),
      fxFeeAmount: parseFloat(fxFeeAmount.toFixed(6)),
      netGBP: parseFloat(netGBP.toFixed(6)),
      toCurrency: quote.to_currency,
    };
  }
}
 
