import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? (exception as HttpException).getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log detailed info for 5xx, concise for 4xx
    if (status >= 500) {
      this.logger.error(
        `Error ${status} ${request.method} ${request.originalUrl} - params:${safeJson(request.params)} query:${safeJson(
          request.query,
        )} body:${safeJson(maskBody(request.body))}`,
        (exception as any)?.stack,
      );
    } else {
      this.logger.warn(
        `HttpException ${status} ${request.method} ${request.originalUrl} - params:${safeJson(
          request.params,
        )} query:${safeJson(request.query)} body:${safeJson(maskBody(request.body))}`,
      );
    }

    const payload =
      isHttp && typeof (exception as HttpException).getResponse === 'function'
        ? (exception as HttpException).getResponse()
        : undefined;

    response.status(status).json(
      typeof payload === 'object' && payload !== null
        ? payload
        : {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: (exception as any)?.message || 'Internal server error',
          },
    );
  }
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return '[unserializable]';
  }
}

function maskBody(body: any) {
  try {
    const b = { ...(body || {}) } as Record<string, any>;
    ['password', 'token', 'authorization', 'sig'].forEach(k => {
      if (k in b) b[k] = '****';
    });
    return b;
  } catch {
    return {};
  }
}
  