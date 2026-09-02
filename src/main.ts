import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use((req, res, next) => {
    if (req.path === '/webhook/whatsapp') {
      return next();
    }
    return json()(req, res, next);
  });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
