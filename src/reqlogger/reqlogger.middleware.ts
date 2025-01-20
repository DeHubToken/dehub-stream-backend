import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ReqloggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
   
    const { ip, method, baseUrl: url, body, params } = request;
    const userAgent = request.get('user-agent') || '';

    const serializedParams = JSON.stringify(params);
    const serializedBody = JSON.stringify(body);

    response.on('close', () => {
      const { statusCode } = response;
      const contentLength = response.get('content-length');
      this.logger.log(
        `${method} ${url} ${statusCode} ${contentLength} - Params: ${serializedParams}, Body: ${serializedBody} - ${userAgent} ${ip}`
      );
    });

    next();
  }
}