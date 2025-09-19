import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ReqloggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, originalUrl, query, params, headers } = request;
    const userAgent = request.get('user-agent') || '';

    response.on('finish', () => {
      const { statusCode } = response;
      const contentLength = response.get('content-length') || '0';
      const serializedQuery = safeStringify(query);
      const serializedParams = safeStringify(params);
      const serializedBody = getBodyPreview(request);

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${contentLength} - Query: ${serializedQuery}, Params: ${serializedParams}, Body: ${serializedBody} - ${userAgent} ${ip}`,
      );

      // Light header context for server errors
      if (statusCode >= 500) {
        this.logger.error(
          `5xx ${method} ${originalUrl} - hdr: ${safeStringify({
            'content-type': headers['content-type'],
            referer: headers['referer'],
            origin: headers['origin'],
          })}`,
        );
      }
    });

    next();
  }
}

function safeStringify(obj: any, maxLen = 1000): string {
  try {
    const str = JSON.stringify(obj ?? {});
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
  } catch {
    return '[unserializable]';
  }
}

function getBodyPreview(req: Request): string {
  const ct = (req.headers['content-type'] || '').toString().toLowerCase();

  // Avoid dumping large multipart bodies; capture fields and file metadata only
  if (ct.includes('multipart/form-data')) {
    const anyReq = req as any;
    const files = anyReq.files || anyReq.file;
    const filesMeta = Array.isArray(files)
      ? files.map((f: any) => ({ name: f.originalname, mime: f.mimetype, size: f.size }))
      : files
      ? [{ name: files.originalname, mime: files.mimetype, size: files.size }]
      : [];
    return safeStringify({ fields: Object.keys(req.body || {}), files: filesMeta });
  }

  const body = { ...(req.body || {}) } as Record<string, any>;
  // Mask common sensitive fields
  ['password', 'token', 'authorization', 'sig'].forEach(k => {
    if (k in body) body[k] = '****';
  });
  return safeStringify(body);
}