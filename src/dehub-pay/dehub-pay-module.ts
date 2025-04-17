import { Module } from '@nestjs/common';
import { DehubPayController } from './dehub-pay-controller';
import { DehubPayService } from './dehub-pay-service';
import { DpayMonitor } from './dehub-pay-monitor';
import { BullModule } from '@nestjs/bull'; // Import BullModule
import { DpayTransactionProcessor } from './dpay-transaction.processor';
import { config } from 'config';
import { TokenTransferService } from './token-transfer.service';

@Module({
  imports: [
    // Register the Bull queue for transaction processing
    BullModule.registerQueue({
      name: 'transactionQueue', // Name of the queue
      redis: {
        ...config.redis, // Redis host (you can replace with your Redis server details)
        db: 3, // Redis port
      },
    }),
  ],
  controllers: [DehubPayController],
  providers: [
    DehubPayService, // DehubPayService for business logic
    DpayMonitor, // DpayMonitor for cron jobs
    DpayTransactionProcessor,TokenTransferService, // Processor for handling queued jobs
  ],
  exports: [DehubPayService], // Export DehubPayService to use in other modules
})
export class DehubPayModule {}
