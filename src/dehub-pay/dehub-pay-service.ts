import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getERC20TokenBalance } from 'common/util/web3';
import { config } from 'config';
import { supportedNetworks, supportedTokens } from 'config/constants';
import { ethers } from 'ethers';
import Redis from 'ioredis';
import { Account, AccountModel } from 'models/Account';
import { DpayTnxModel } from 'models/dpay/dpay-transactions';
import mongoose from 'mongoose';

const defaultWalletAddress = '0xC8acD6eeeD02EA0dA142D57941E1102e81Cc0b77';
import Stripe from 'stripe';

@Injectable()
export class DehubPayService {
  private readonly logger = new Logger(DehubPayService.name);
  private readonly stripe: Stripe;
  private redisClient: Redis;

  constructor() {
    this.redisClient = new Redis({ ...config.redis, db: 3 });
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-03-31.basil',
    });
  }

  async getTnxs(filter, cache = true) {
    try {
      // Check Redis cache first
      const cacheKey = `transactions:${JSON.stringify(filter)}`;
      const cachedTransactions = await this.redisClient.get(cacheKey);
      if (cache && cachedTransactions) {
        return JSON.parse(cachedTransactions);
      }

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

      // Cache the result for 1 minute
      await this.redisClient.setex(cacheKey, 60, JSON.stringify(transactions));

      return transactions;
    } catch (error) {
      this.logger.error('Error fetching transactions:', error.message);
      throw new Error('Failed to fetch transactions');
    }
  }

  async checkout({ chainId, address, receiverAddress, amount, tokensToReceive, redirect }) {
    try {
      const { price: tokenPriceUSD } = await this.coingeckoGetPrice('dehub', 'usd');
      if (!tokenPriceUSD) {
        throw new Error(`Token price for dehub not found`);
      }
      const user = await AccountModel.findOne({ address: address.toLowerCase() });
      if (!user) {
        throw new Error('User not Found.');
      }
      const timestep = Date.now(); // or your preferred unique timestamp
      const transaction = new DpayTnxModel({
        sessionId: `temp+${Math.random() * 100}-${timestep}`, // temp placeholder
        amount,
        tokenSymbol: 'DHB',
        chainId,
        receiverId: user._id,
        status_stripe: 'init',
        type: 'buy_token',
        receiverAddress,
        approxTokensToReceive: tokensToReceive,
      });

      await transaction.save();

      const session = await this.createStripeSession('dehub', amount, transaction._id.toString(), redirect);

      transaction.sessionId = session.id;
      transaction.status_stripe = 'pending';
      await transaction.save(); // Save updated fields

      return { id: session.id, url: session.url };
    } catch (error) {
      this.logger.error('Error during checkout process', error.message);
      throw error;
    }
  }

  async createStripeSession(token: string, usdAmount: number, id: string, redirect?: string) {
    try {
      // Fetch token price from Coingecko or your pricing service
      const { price: tokenPrice } = await this.coingeckoGetPrice(token, 'usd');

      if (!tokenPrice) {
        throw new Error(`Failed to fetch price for ${token}`);
      }

      // Calculate approximate tokens user will receive
      const approxTokensToReceive = usdAmount / tokenPrice;

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card', 'us_bank_account', 'ideal'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${token} Token Purchase`,
                description: `Approx. ${approxTokensToReceive.toFixed(2)} ${token} tokens`,
                images: [
                  // Replace this with your actual token image URL
                  'https://dehub.io/icons/DHB.png',
                ],
              },
              unit_amount: Math.round(usdAmount * 100), // Stripe needs value in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${redirect ?? process.env.FRONT_END_URL}/dpay/tnx?sid=${id}`,
        cancel_url: `${redirect ?? process.env.FRONT_END_URL}/dpay/tnx?sid=${id}`,
        metadata: {
          token,
          usdAmount: usdAmount.toString(),
          approxTokensToReceive: approxTokensToReceive.toString(),
        },
      });

      return session;
    } catch (error) {
      this.logger.error('Error creating Stripe session', error.message);
      throw new Error('Failed to create Stripe checkout session');
    }
  }

  async coingeckoGetPrice(tokenSymbol: string, currency: string) {
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

  async checkTokenAvailability(address: string = defaultWalletAddress) {
    try {
      const cacheKey = `tokenBalances:${address.toLowerCase()}`;
      const cachedBalances = await this.redisClient.get(cacheKey);
      if (cachedBalances) {
        return JSON.parse(cachedBalances);
      }

      const balancePromises = supportedTokens.map(async token => {
        try {
          const balance = await getERC20TokenBalance(address, token.address, token.chainId);
          return { chainId: token.chainId, symbol: token.symbol, balance };
        } catch (error) {
          this.logger.warn(`Error fetching ${token.symbol} balance on chain ${token.chainId}: ${error.message}`);
          return { chainId: token.chainId, symbol: token.symbol, balance: 0 };
        }
      });

      const results = await Promise.all(balancePromises);
      const groupedBalances = this.groupBalancesByChain(results);

      // Cache the result for 1 hour
      await this.redisClient.setex(cacheKey, 3600, JSON.stringify(groupedBalances));

      return groupedBalances;
    } catch (error) {
      this.logger.error('Error checking token availability', error.message);
      throw new Error('Failed to check token availability');
    }
  }

  async checkGasAvailability(address: string = defaultWalletAddress) {
    try {
      const cacheKey = `gasBalances:${address.toLowerCase()}`;
      const cachedGasBalances = await this.redisClient.get(cacheKey);
      if (cachedGasBalances) {
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
      await this.redisClient.setex(cacheKey, 3600, JSON.stringify(formattedBalances));

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
    if(status_stripe=="failed"){
     return  DpayTnxModel.updateOne({ sessionId }, { $set: { status_stripe ,tokenSendStatus:"cancelled"} });
    }
    return await DpayTnxModel.updateOne({ sessionId }, { $set: { status_stripe } });
  }
  async getTransactionBySessionId(sessionId: string) {
    return DpayTnxModel.findOne({ sessionId });
  }

  async updateTokenSendStatus(sessionId: string, updates: Partial<any>) {
    return DpayTnxModel.updateOne({ sessionId }, { $set: updates });
  }
  async successCallBack(sid) {}
  async cancelCallBack(sid) {}
}
