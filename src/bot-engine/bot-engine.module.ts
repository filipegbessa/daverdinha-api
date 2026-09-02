import { Module } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { DeliveryCheckService } from './delivery-check.service';
import { BotSettingsModule } from '../bot-settings/bot-settings.module';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { WhatsAppClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [BotSettingsModule, MenuItemsModule, WhatsAppClientModule],
  providers: [BotEngineService, DeliveryCheckService],
  exports: [BotEngineService],
})
export class BotEngineModule {}
