import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from 'cors';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { clerkProxyMiddleware } from './common/auth/clerk-proxy.middleware';
import { createCorsOriginHandler } from './cors-origin';
import { OpenApiService } from './openapi/openapi.service';

// The WhatsApp webhook verifies Meta's HMAC signature against the exact
// bytes Meta sent, so it must NOT go through the JSON body parser (which
// would consume the stream and leave us with a re-serialized body that no
// longer matches the signature). RawBodyMiddleware parses that route instead.
const RAW_BODY_ROUTES = ['/webhook/whatsapp'];

// Shared with api/index.ts, which answers an OPTIONS preflight with this
// same config directly — before paying for a full Nest bootstrap just to
// get a 204 back.
export const corsOptions: CorsOptions = {
  origin: createCorsOriginHandler(process.env.FRONTEND_URL),
};

/**
 * The single source of truth for app-level wiring, shared by both entry
 * points: `src/main.ts` (local `nest start`) and `api/index.ts` (the
 * serverless handler Vercel runs). Keeping it here is what stops local and
 * production from silently drifting apart when one of them gets a tweak.
 */
export function configureApp(app: INestApplication): void {
  // Ahead of the JSON parser: the Clerk proxy forwards the raw body.
  app.use(clerkProxyMiddleware());
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (RAW_BODY_ROUTES.includes(req.path)) {
      return next();
    }
    return json()(req, res, next);
  });

  app.enableCors(corsOptions);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.get(OpenApiService).attach(app);
}
