import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DehubPayService } from './dehub-pay-service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class DpayMonitor implements OnModuleInit {
  private readonly logger = new Logger(DpayMonitor.name);

  constructor(
    private readonly dehubPayService: DehubPayService,
    @InjectQueue('transactionQueue') private readonly transactionQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('DpayMonitor initialized.');
  }

  /**
   * Cron job to monitor pending transactions every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorPendingTransactions() {
    this.logger.log('Checking for pending transactions...');

    try {
      const pendingTransactions = await this.dehubPayService.getTnxs({ status_stripe: 'pending', }, false);
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
}
