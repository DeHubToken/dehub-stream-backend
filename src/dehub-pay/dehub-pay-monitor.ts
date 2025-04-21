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

  /**
   * Cron job to monitor pending transactions every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorStripePendingTransactions() {
    this.logger.log('Checking for pending transactions...');

    try {
      const pendingTransactions = await this.dehubPayService.getTnxs(
        { status_stripe: 'pending', tokenSendStatus: 'not_sent' },
        false,
      );
      const jobs = [];

      for (const tx of pendingTransactions) {
        if (tx.status_stripe === 'pending') {
          jobs.push({
            name: 'verifyTransaction',
            data: { sessionId: tx.sessionId },
          });
        }
      }

      if (jobs.length) {
        await this.addJobsBulk(jobs);
        this.logger.log(`Queued ${jobs.length} pending transaction(s) for verification.`);
      }
    } catch (error) {
      this.logger.error('Error monitoring transactions:', error.message);
    }
  }
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorStripeSuccessTransactions() {
    this.logger.log('Checking for Success transactions...');

    try {
      const pendingTransactions = await this.dehubPayService.getTnxs(
        { status_stripe: 'succeeded', tokenSendStatus: 'not_sent' },
        false,
      );
      const jobs = [];

      for (const tx of pendingTransactions) {
        if (tx.status_stripe === 'succeeded') {
          jobs.push({
            name: 'transferToken',
            data: {
              sessionId: tx.sessionId,
              receiverAddress: tx.receiverAddress,
              amount: tx.amount,
              tokenAddress: tx.tokenAddress,
              chainId: tx.chainId,
            },
            opts: {
              jobId: `transferToken-${tx.sessionId}`, // unique identifier
            },
          });
        }
      }

      if (jobs.length) {
        await this.addJobsBulk(jobs);
    const affected=    await DpayTnxModel.updateMany(
          {
            sessionId: { $in: jobs.map(job => job.data.sessionId) },
          },
          {
            $set: { tokenSendStatus: 'processing' }, // or whatever field you want to update
          },
        );
        console.log("affected",affected)
        this.logger.log(`Queued ${jobs.length} success transaction(s) for token Transfer.`);
      }
    } catch (error) {
      this.logger.error('Error monitoring transactions:', error.message);
    }
  }
  /**
   * Add a single job to the transaction queue.
   */
  async addJob(data: any, options) {
    await this.transactionQueue.add('verifyTransaction', data, options);
    this.logger.log(`Added single job for sessionId: ${data.sessionId}`);
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
        await job.remove();
        this.logger.log(`Removed job ID: ${job.id}, Name: ${job.name}`);
      }
    }

    this.logger.log('✅ All jobs cleared from transactionQueue.');
  }
}

// const transferDetails = await this.dehubPayService.getTransferDetailsBySessionId(sessionId);
// if (transferDetails) {
//   const { receiverAddress, amount, tokenAddress, chainId } = transferDetails;

//   await this.transactionQueue.add('transferToken', {
//     sessionId,
//     receiverAddress,
//     amount,
//     tokenAddress,
//     chainId,
//   });
//   this.logger.log(`Scheduled transferToken job for sessionId: ${sessionId}`);
// } else {
//   this.logger.warn(`No transfer details found for sessionId: ${sessionId}`);
// }
