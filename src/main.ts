import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
