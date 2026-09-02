import { Module } from '@nestjs/common';
import { BotSettingsService } from './bot-settings.service';
import { BotSettingsController } from './bot-settings.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [BotSettingsService],
  controllers: [BotSettingsController],
  exports: [BotSettingsService],
})
export class BotSettingsModule {}
