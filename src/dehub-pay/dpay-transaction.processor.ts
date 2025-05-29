import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { DehubPayService } from './dehub-pay-service';
import { TokenTransferService } from './token-transfer.service';
import { ChainId, supportedNetworks } from 'config/constants';
import { DpayTnxModel } from 'models/dpay/dpay-transactions';
import { symbolToIdMap } from './constants';

@Injectable()
@Processor('transactionQueue')
export class DpayTransactionProcessor {
  private readonly logger = new Logger(DpayTransactionProcessor.name);

  constructor(
    private readonly dehubPayService: DehubPayService,
    private readonly tokenTransferService: TokenTransferService,
    @InjectQueue('transactionQueue') private readonly transactionQueue: Queue,
  ) {}

  @Process({ name: 'verifyTransaction', concurrency: 100 })
  async processTransaction(job: Job) {
    const { sessionId } = job.data;

    try {
      this.logger.log(`Processing transaction with sessionId: ${sessionId}`);
      const isPaid = await this.dehubPayService.verifyTransactionStatus(sessionId);
      const transferDetails = await this.dehubPayService.getTransferDetailsBySessionId(sessionId);
      if (isPaid) {
        const { payment_intent } = await this.dehubPayService.getStripeSessionId(sessionId);
        const { latest_charge, status } = await this.dehubPayService.getStripeIntent(payment_intent);
        await this.dehubPayService.updateTransaction(sessionId, {
          latest_charge,
          intentId: payment_intent,
          status_stripe: status,
        });
      } else {
        this.logger.log(`Transaction ${sessionId} is not completed yet.`);

        if (transferDetails?.createdAt) {
          const createdAt = new Date(transferDetails.createdAt);
          const now = new Date();
          const diffInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

          if (diffInMinutes > 20) {
            this.logger.log(`Transaction ${sessionId} is older than 20 minutes. Marking as failed.`);
            await this.dehubPayService.updateTransactionStatus(sessionId, 'failed');
          }
        } else {
          this.logger.warn(`Missing creation time for sessionId: ${sessionId}, cannot evaluate expiry.`);
        }
      }
    } catch (error) {
      console.log(error);
      this.logger.error(`Error processing transaction ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  @Process({ name: 'transferToken', concurrency: 1 })
  async processTokenTransfer(job: Job) {
    const { id } = job.data;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000 * 60;
    const {
      chainId,
      net,
      sessionId,
      receiverAddress,
      tokenAddress,
      amount: amt,
      currency,
      tokenSymbol,
    } = await DpayTnxModel.findById(id);
    try {
      this.logger.log('Waiting....', this.tokenTransferService.getProcessing());

      const network = supportedNetworks.find(net => net.chainId === chainId);
      if (!network) throw new Error(`Unsupported chainId: ${chainId}`);

      const { price: tokenPrice } = await this.dehubPayService.coinMarketCapGetPrice(
        symbolToIdMap[tokenSymbol],
        'gbp',
        net,
      );
      const onePercentNetGBP = net * 0.01;

      const chainGasSymbol = {
        [ChainId.BASE_MAINNET]: 'BASE',
        [ChainId.BSC_MAINNET]: 'BNB',
        [ChainId.BSC_TESTNET]: 'BNB',
      };
      // const chainGasSymbol = {// in the case of coingeko
      //   [ChainId.BASE_MAINNET]: 'base',
      //   [ChainId.BSC_MAINNET]: 'binancecoin',
      //   [ChainId.BSC_TESTNET]: 'binancecoin',
      // };

      console.log(' chainGasSymbol[chainId]', chainGasSymbol[chainId]);
      const { price: nativeTokenPrice } = await this.dehubPayService.coinMarketCapGetPrice(
        chainGasSymbol[chainId],
        'gbp',
        net,
      );
      const nativeAmount = parseFloat((onePercentNetGBP / nativeTokenPrice).toFixed(8));
      const amount = (net - onePercentNetGBP) / tokenPrice;
      this.logger.log(
        `Starting token transfer: sessionId=${sessionId}, receiverAddress=${receiverAddress}, amount=${amt},  amount=${net},token=${tokenAddress}, chainId=${chainId}`,
      );
      await this.dehubPayService.updateTokenSendStatus(sessionId, {
        tokenSendStatus: 'sending',
        lastTriedAt: new Date(),
      });

      const txHash = await this.tokenTransferService.transferERC20({
        to: receiverAddress,
        amount,
        tokenSymbol: tokenSymbol ?? 'DHB',
        chainId,
      });

      const receipt = await this.tokenTransferService.getTransactionReceipt(txHash, chainId);

      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction failed on-chain. TxHash: ${txHash}`);
      }
      await this.dehubPayService.updateTokenSendStatus(sessionId, {
        tokenSendStatus: 'sent',
        status: 'success',
        tokenReceived: amount,
        tokenSendTxnHash: txHash,
      });
      this.logger.log(`Starting native gas transfer... sessionId=${sessionId}`);
      await this.dehubPayService.updateTokenSendStatus(sessionId, {
        ethSendStatus: 'sending',
        lastTriedAt: new Date(),
      });
      const gasTxHash = await this.tokenTransferService.transferETH({
        toAddress: receiverAddress,
        amountInEth: nativeAmount,
        chainId,
      });

      const receiptGasTxHash = await this.tokenTransferService.getTransactionReceipt(gasTxHash, chainId);
      if (!receiptGasTxHash || receiptGasTxHash.status !== 1)
        throw new Error(`Native transfer failed. TxHash: ${gasTxHash}`);

      await this.dehubPayService.updateTokenSendStatus(sessionId, {
        ethSendStatus: 'sent',
        ethToSent: nativeAmount,
        ethTxnHash: receiptGasTxHash,
      });
      this.logger.log(`✅ Gas transfer confirmed for sessionId ${sessionId}`);
      this.logger.log(`✅ Token transfer confirmed on-chain for sessionId ${sessionId}. TxHash: ${txHash}`);
    } catch (error) {
      this.logger.error(`❌ Token transfer failed for sessionId ${sessionId}: ${error.message}`);

      const txn = await this.dehubPayService.getTransactionBySessionId(sessionId);
      const retryCount = txn?.tokenSendRetryCount ?? 0;

      if (retryCount < MAX_RETRIES) {
        this.logger.warn(
          `🔁 Retrying token transfer for sessionId ${sessionId}. Attempt ${retryCount + 1}/${MAX_RETRIES}`,
        );
        await this.dehubPayService.updateTokenSendStatus(sessionId, {
          tokenSendStatus: 'failed',
          tokenSendRetryCount: retryCount + 1,
          lastTriedAt: new Date(),
          note: error.toString(),
        });
        await this.transactionQueue.add('transferToken', job.data, {
          delay: RETRY_DELAY_MS,
        });
      } else {
        this.logger.error(`❌ Max retries reached for sessionId ${sessionId}. Giving up.`);
        await this.dehubPayService.updateTokenSendStatus(sessionId, {
          tokenSendStatus: 'failed',
          lastTriedAt: new Date(),
        });
      }
    }
  }
}
