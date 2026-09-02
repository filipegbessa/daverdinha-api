import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { BotSettingsModule } from './bot-settings/bot-settings.module';

@Module({
  imports: [PrismaModule, BotSettingsModule],
  controllers: [AppController],
})
export class AppModule {}
