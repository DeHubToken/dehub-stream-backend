// src/common/middleware/logger.middleware.ts
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DehubPayService } from './dehub-pay-service';

@Injectable()
export class DehubPayMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DehubPayMiddleware.name);
  constructor(private readonly dehubPayService: DehubPayService) {}
  use(req: Request, res: Response, next: NextFunction) {
    //here code for
    next();
  }
}
