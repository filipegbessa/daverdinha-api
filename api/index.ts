import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import express, { Express } from 'express';
import { IncomingMessage, ServerResponse } from 'http';

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
  const app = await bootstrap();
  app(req, res);
};
