import { Module } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';
import { MenuItemsController } from './menu-items.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { BotSettingsModule } from '../bot-settings/bot-settings.module';

@Module({
  imports: [ClerkAuthModule, BotSettingsModule],
  providers: [MenuItemsService],
  controllers: [MenuItemsController],
  exports: [MenuItemsService],
})
export class MenuItemsModule {}
