import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import express, { Express } from 'express';
import { IncomingMessage, ServerResponse } from 'http';

let cachedApp: Express;

async function bootstrap(): Promise<Express> {
  if (cachedApp) return cachedApp;

  const expressApp = express();
  const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bodyParser: false,
  });

  nestApp.use((req: any, res: any, next: any) => {
    if (req.path === '/webhook/whatsapp') {
      return next();
    }
    return express.json()(req, res, next);
  });

  nestApp.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' });
  nestApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await nestApp.init();
  cachedApp = expressApp;
  return cachedApp;
}

export default async (req: IncomingMessage, res: ServerResponse) => {
  const app = await bootstrap();
  app(req, res);
};
