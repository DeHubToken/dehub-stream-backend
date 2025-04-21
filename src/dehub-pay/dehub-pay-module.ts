// src/dehub-pay/dehub-pay.module.ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { DehubPayController } from './dehub-pay-controller';
import { DehubPayService } from './dehub-pay-service';
import { DpayMonitor } from './dehub-pay-monitor';
import { BullModule } from '@nestjs/bull';
import { DpayTransactionProcessor } from './dpay-transaction.processor';
import { config } from 'config';
import { TokenTransferService } from './token-transfer.service'; 
import { DehubPayMiddleware } from './dehub-pay-middleware';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transactionQueue',
      redis: {
        ...config.redis,
        db: 3,
      },
    }),
  ],
  controllers: [DehubPayController],
  providers: [
    DehubPayService,
    DpayMonitor,
    DpayTransactionProcessor,
    TokenTransferService,
  ],
  exports: [DehubPayService],
})
export class DehubPayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(DehubPayMiddleware)
      .forRoutes({ path: 'dpay/checkout', method: RequestMethod.POST });
  }
}
