import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { createCorsOriginHandler } from './cors-origin';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use((req, res, next) => {
    if (req.path === '/webhook/whatsapp') {
      return next();
    }
    return json()(req, res, next);
  });

  app.enableCors({ origin: createCorsOriginHandler(process.env.FRONTEND_URL) });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
