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
    // this.clearAllJobs(); // use in only dev
  }

  async onModuleInit() {
    this.logger.log('DpayMonitor initialized.');
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
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
            {
              status_stripe: { $exists: false }, // Handles missing status_stripe
              tokenSendStatus: 'not_sent',
              expires_at: { $lt: now },
            },
            {
              expires_at: { $exists: false }, // Handles missing expires_at
              status_stripe: { $in: ['pending', 'init'] },
              tokenSendStatus: 'not_sent',
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
  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorStripePendingTransactions() {
    this.logger.log('Checking for pending transactions...');

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
  @Cron(CronExpression.EVERY_10_SECONDS)
  async monitorStripeSuccessTransactions() {
    this.logger.log('Checking for Success transactions...');

    try {
      const pendingTransactions = await this.dehubPayService.getTnxs(
        {
          status_stripe: { $in: ['succeeded', 'complete'] },
          tokenSendStatus: { $in: ['not_sent'] },
        },
        [{ $limit: 1 }],
      );
      for (const tx of pendingTransactions) {
        try {
          const tnx = await this.dehubPayService.stripeLatestChargeByIntentOrSessionId(tx.sessionId);

          if (!tnx) {
            return;
          }
          if (!tnx.net) {
            return;
          }
          await this.dehubPayService.updateTransaction(tx.sessionId, {
            fee: tnx.fee / 100,
            net: tnx.net / 100,
            exchange_rate: tnx.exchange_rate,
            tokenSendStatus: 'processing',
          });
          this.addJobsBulk([
            {
              name: 'transferToken',
              data: {
                id: tx._id,
              },
              opts: {
                jobId: `transferToken-${tx.sessionId}`, // unique identifier
              },
            },
          ]);

          this.logger.log('👇 Push job for token transfer', tx.sessionId);
        } catch (error) {
          await this.dehubPayService.updateTransaction(tx.sessionId, {
            tokenSendStatus: 'failed',
            note: error.toString(),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error monitoring transactions:', error.message);
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
    this.logger.log(`Added ${jobs.length} jobs to transactionQueue in bulk.`);
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
