import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DehubPayMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Example: Log request method and URL
    console.log(`[DehubPay] ${req.method} ${req.originalUrl}`);

    // Example: Check for required API key header
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.DEHUB_PAY_API_KEY) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    next();
  }
}
