import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DehubPayService } from './dehub-pay-service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DpayTnxModel } from 'models/dpay/dpay-transactions';

@Injectable()
export class DpayMonitor implements OnModuleInit {
  private readonly logger = new Logger(DpayMonitor.name);

  constructor(
    private readonly dehubPayService: DehubPayService,
    @InjectQueue('transactionQueue') private readonly transactionQueue: Queue,
  ) {


    setTimeout(async () => {
      const tnx = await DpayTnxModel.findOne({
        sessionId: 'cs_live_a1C24NOMxO3dirn3XUDHtLKSI2HhJhG7tFKFC0czsbZvais5JGooZAmKPC',
      });

      if (tnx.tokenSendStatus != 'sent') {
     
        await DpayTnxModel.findOneAndUpdate(
          {
            sessionId: 'cs_live_a1C24NOMxO3dirn3XUDHtLKSI2HhJhG7tFKFC0czsbZvais5JGooZAmKPC',
          },
          {
            $set: {
              tokenSendStatus: 'sent',
              tokenSendRetryCount: 0,
              ethSendStatus: 'not_sent',
            },
          }
        );
        
        await DpayTnxModel.findOneAndUpdate(
          {
            sessionId: 'cs_live_a1lYdQMkxmK4RP0wuZU3fVCWa36rPsGI5BanCmDJLTy7o8Z8zrIi5Hc3NF',
          },
          {
            $set: {
              tokenSendStatus: 'not_sent',
              ethSendStatus: 'not_sent',
              status_stripe: 'pending',
              tokenSendRetryCount: 0,
            },
          }
        );
        
      }

      const resultForToken = await DpayTnxModel.updateMany(
        {
          status_stripe: { $in: ['succeeded', 'complete'] },
          tokenSendStatus: { $in: ['sending'] },
          tokenSendRetryCount: { $lt: 3 },
        },
        {
          $set: { tokenSendStatus: 'not_sent' },
        },
      );

      const resultForGas = await DpayTnxModel.updateMany(
        {
          status_stripe: { $in: ['succeeded', 'complete'] },
          ethSendStatus: { $in: ['sending'] },
          tokenSendRetryCount: { $lt: 3 },
        },
        {
          $set: { tokenSendStatus: 'not_sent' },
        },
      );
      console.log('OnRestartServer', JSON.stringify({ resultForToken, resultForGas }, null, 1));

    }, 100);
    this.clearAllJobs();
    this.reTryJobTokenTransfer();
  }
  async onModuleInit() {
    this.logger.log('DpayMonitor initialized.');
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireTheTnx() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = await DpayTnxModel.updateMany(
        {
          $or: [
            {
              status_stripe: { $in: ['pending', 'init'] },
              tokenSendStatus: 'not_sent',
              expires_at: { $lt: now },
            },
          ],
        },
        {
          $set: { status_stripe: 'expired' },
        },
      );

      if (result.modifiedCount > 0) {
        this.logger.log(`✅ Expired ${result.modifiedCount} transactions.`);
      } else {
        // this.logger.log(`✅ No pending transactions found to expire.`);
      }
    } catch (error) {
      this.logger.error('❌ Error expiring transactions:', error.message);
    }
  }

  /**
   * Cron job to monitor pending transactions every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorStripePendingTransactions() {
    // this.logger.log('Checking for pending transactions...');

    try {
      const pendingTransactions = await this.dehubPayService.getTnxs(
        {
          status_stripe: { $in: ['pending', 'init'] },
          tokenSendStatus: 'not_sent',
          expires_at: { $gt: Math.floor(Date.now() / 1000) },
        },
        [],
      );
      const jobs = [];

      for (const tx of pendingTransactions) {
        jobs.push({
          name: 'verifyTransaction',
          data: { sessionId: tx.sessionId },
        });
      }

      if (jobs.length) {
        await this.addJobsBulk(jobs);
        this.logger.log(`Queued ${jobs.length} pending transaction(s) for verification.`);
      }
    } catch (error) {
      this.logger.error('Error monitoring pending transactions:', error);
      this.logger.error('Error monitoring  pending transactions:', error.message);
    }
  }
  @Cron(CronExpression.EVERY_5_SECONDS)
  async monitorStripeSuccessTransactions() {
    // this.logger.log('Checking for Success transactions...');
    const pendingTransactions = await this.dehubPayService.getTnxs(
      {
        status_stripe: { $in: ['succeeded', 'complete'] },
        $or: [{ tokenSendStatus: { $in: ['not_sent'] } }, { ethSendStatus: { $in: ['not_sent'] } }],
      },
      [{ $limit: 1 }],
    );
    try {
      for (const tx of pendingTransactions) {
        try {
          await this.dehubPayService.syncChargesFromStripe(tx);
          this.addJobsBulk([
            {
              name: 'transferToken',
              data: {
                id: tx._id,
                sid: tx.sessionId,
              },
              opts: {
                // jobId: `transferToken-${tx.sessionId}`, // unique identifier
              },
            },
          ]);
          if (tx.tokenSendStatus != 'sent') {
            await this.dehubPayService.updateTransaction(tx.sessionId, {
              tokenSendStatus: 'processing',
            });
          }
          if (tx.ethSendStatus != 'sent') {
            await this.dehubPayService.updateTransaction(tx.sessionId, {
              ethSendStatus: 'processing',
            });
          }
          this.logger.log('👇 Push job for token or gas transfer', tx.sessionId);
        } catch (error) {
          this.logger.error(error);
          const failUpdate: any = {
            note: error.toString(),
          };
          if (tx.tokenSendStatus != 'sent') failUpdate.tokenSendStatus = 'failed';
          if (tx.ethSendStatus != 'sent') failUpdate.ethSendStatus = 'failed';
          await this.dehubPayService.updateTransaction(tx.sessionId, failUpdate);
        }
      }
    } catch (error) {
      this.logger.error('Error monitoring transactions:', error.message);
    }
  }
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reTryJobTokenTransfer() {
    try {
      const resultForToken = await DpayTnxModel.updateMany(
        {
          status_stripe: { $in: ['succeeded', 'complete'] },
          tokenSendStatus: { $in: ['processing', 'failed'] },
          tokenSendRetryCount: { $lt: 3 },
        },
        {
          $set: { tokenSendStatus: 'not_sent' },
        },
      );
      if (resultForToken.modifiedCount != 0) {
        console.log('Retry Job: Update resultForToken:', resultForToken);
        console.log(`Retry Job: Matched ${resultForToken.matchedCount}, Modified ${resultForToken.modifiedCount}`);
      }

      const resultForGas = await DpayTnxModel.updateMany(
        {
          status_stripe: { $in: ['succeeded', 'complete'] },
          tokenSendStatus: { $in: ['sent'] },
          ethSendStatus: { $in: ['processing', 'failed'] },
          tokenSendRetryCount: { $lt: 3 },
        },
        {
          $set: { ethSendStatus: 'not_sent' },
        },
      );
      if (resultForGas.modifiedCount != 0) {
        console.log('Retry Job: Update resultForGas:', resultForGas);
        console.log(`Retry Job: Matched ${resultForGas.matchedCount}, Modified ${resultForGas.modifiedCount}`);
      }
    } catch (error) {
      console.error('Retry Job: Error occurred while updating transactions:', error);
    }
  }
  // @Cron(CronExpression.EVERY_10_SECONDS)
  // async retryFailedJob(){
  //   const statuses:['failed'] = ['failed'];

  //   // Get all failed jobs from the queue
  //   const jobs = await this.transactionQueue.getJobs(statuses);

  //   for (const job of jobs) {
  //     try {
  //       this.logger.log(`Retrying job ${job.id}`);
  //       await job.retry();
  //     } catch (err) {
  //       this.logger.error(`Failed to retry job ${job.id}: ${err.message}`);
  //     }
  //   }
  // }
  /**
   * Add a single job to the transaction queue.
   */
  async addJob(data: any, options) {
    await this.transactionQueue.add('verifyTransaction', data, options);
    this.logger.log(`Added single job for sessionId: ${data.sessionId}`);
  }
  /**
   * Add a single job to the transaction queue.
   */
  async addJobTokenTransfer(data: any, options: any) {
    await this.transactionQueue.add('transferToken', data, options);
    this.logger.log(`Added token transfer job for sessionId: ${data.sessionId}`);
  }

  /**
   * Add multiple jobs in bulk to the transaction queue.
   */
  async addJobsBulk(jobs: { name: string; data: any; opts }[]) {
    await this.transactionQueue.addBulk(jobs);
    this.logger.log(`Added ${jobs.length} jobs to transactionQueue.`);
  }
  async getQueueJobs(
    statuses: ('waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused')[] = [
      'waiting',
      'active',
      'delayed',
    ],
  ): Promise<any> {
    const jobs = await this.transactionQueue.getJobs(statuses);

    this.logger.log(`Found ${jobs.length} job(s) in statuses: ${statuses.join(', ')}`);

    jobs.forEach(job => {
      this.logger.log(`Job ID: ${job.id}, Name: ${job.name}, Data: ${JSON.stringify(job.data)}`);
    });

    return jobs;
  }

  async clearAllJobs(): Promise<void> {
    const statuses: ('completed' | 'active' | 'delayed' | 'failed')[] = ['completed', 'active', 'delayed', 'failed'];

    for (const status of statuses) {
      const jobs = await this.transactionQueue.getJobs([status]);

      for (const job of jobs) {
        try {
          await job.remove();
          this.logger.log(`Removed job ID: ${job.id}, Name: ${job.name}`);
        } catch (error) {
          this.logger.log(`Failed to Remove job ID: ${job.id}, Name: ${job.name}`);
        }
      }
    }

    this.logger.log('✅ All jobs cleared from transactionQueue.');
  }
}
