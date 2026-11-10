import { Injectable, NestMiddleware } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import getRawBody from 'raw-body';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  async use(req: RawBodyRequest<Request>, res: Response, next: NextFunction) {
    const raw = await getRawBody(req);
    req.rawBody = raw;
    req.body = JSON.parse(raw.toString('utf8')) as unknown;
    next();
  }
}
