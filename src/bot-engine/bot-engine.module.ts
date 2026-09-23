import { Module } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { DeliveryCheckService } from './delivery-check.service';
import { BotSettingsModule } from '../bot-settings/bot-settings.module';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { MessagingModule } from '../messaging/messaging.module';
import { WhatsAppClientModule } from '../whatsapp/whatsapp-client.module';
import { DeliveryLocationsModule } from '../delivery-locations/delivery-locations.module';
import { CepLookupModule } from '../cep-lookup/cep-lookup.module';
import { MediaStorageModule } from '../media/media-storage.module';

@Module({
  imports: [
    BotSettingsModule,
    MenuItemsModule,
    MessagingModule,
    WhatsAppClientModule,
    DeliveryLocationsModule,
    CepLookupModule,
    MediaStorageModule,
  ],
  providers: [BotEngineService, DeliveryCheckService],
  exports: [BotEngineService],
})
export class BotEngineModule {}
