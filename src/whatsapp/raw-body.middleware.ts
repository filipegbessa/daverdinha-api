import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import getRawBody from 'raw-body';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const raw = await getRawBody(req);
    (req as any).rawBody = raw;
    req.body = JSON.parse(raw.toString('utf8'));
    next();
  }
}
