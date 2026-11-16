import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp, corsOptions } from '../src/bootstrap';
import cors from 'cors';
import express, { Express } from 'express';
import { IncomingMessage, ServerResponse } from 'http';

// Same middleware/options `configureApp` installs via `app.enableCors()` —
// called here, before `bootstrap()`, so an OPTIONS preflight never pays for
// a full Nest cold boot (DI + route mapping) just to get a 204 back. The
// preflight never reaches the Nest router/guards even in the normal flow
// (cors() intercepts it earlier in the Express middleware chain), so this
// doesn't change behavior, only when it runs.
const corsPreflight = cors(corsOptions);

let cachedApp: Express;

async function bootstrap(): Promise<Express> {
  if (cachedApp) return cachedApp;

  const expressApp = express();
  const nestApp = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    {
      bodyParser: false,
    },
  );

  configureApp(nestApp);

  await nestApp.init();
  cachedApp = expressApp;
  return cachedApp;
}

export default async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'OPTIONS') {
    corsPreflight(req, res, () => {});
    return;
  }

  const app = await bootstrap();
  app(req, res);
};
