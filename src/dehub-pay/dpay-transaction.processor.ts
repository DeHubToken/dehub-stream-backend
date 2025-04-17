import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { DehubPayService } from './dehub-pay-service';
import { TokenTransferService } from './token-transfer.service';
import { supportedNetworks } from 'config/constants';

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
        await this.dehubPayService.updateTransactionStatus(sessionId, 'success');
        this.logger.log(`Transaction ${sessionId} marked as completed.`);

        if (transferDetails) {
          const { receiverAddress, amount, tokenAddress, chainId } = transferDetails;

          await this.transactionQueue.add('transferToken', {
            sessionId,
            receiverAddress,
            amount,
            tokenAddress,
            chainId,
          });
          this.logger.log(`Scheduled transferToken job for sessionId: ${sessionId}`);
        } else {
          this.logger.warn(`No transfer details found for sessionId: ${sessionId}`);
        }
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
      this.logger.error(`Error processing transaction ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  @Process({ name: 'transferToken', concurrency: 100 })
  async processTokenTransfer(job: Job) {
    const { sessionId, receiverAddress, amount: usdAmount, tokenAddress, chainId } = job.data;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000 * 60;

    try {
      const network = supportedNetworks.find(net => net.chainId === chainId);
      if (!network) throw new Error(`Unsupported chainId: ${chainId}`);

      const { price: tokenPrice } = await this.dehubPayService.coingeckoGetPrice('dehub', 'usd');
      const amount = usdAmount / tokenPrice;

      this.logger.log(
        `Starting token transfer: sessionId=${sessionId}, receiverAddress=${receiverAddress}, amount=${amount}, token=${tokenAddress}, chainId=${chainId}`,
      );

      await this.dehubPayService.updateTokenSendStatus(sessionId, {
        tokenSendStatus: 'sending',

        lastTriedAt: new Date(),
      });

      const txHash = await this.tokenTransferService.transferERC20({
        to: receiverAddress,
        amount,
        tokenSymbol: 'DHB',
        chainId,
      });

      const receipt = await this.tokenTransferService.getTransactionReceipt(txHash, chainId);

      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction failed on-chain. TxHash: ${txHash}`);
        // throw new Error(`Transaction failed on-chain. TxHash: `);
      }

      await this.dehubPayService.updateTokenSendStatus(sessionId, {
        tokenSendStatus: 'sent',
        status: 'success',
        approxTokensToSent: amount,
        tokenSendTxnHash: txHash,
      });

      // this.logger.log(`✅ Token transfer confirmed on-chain for sessionId ${sessionId}. TxHash: ${txHash}`);
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
