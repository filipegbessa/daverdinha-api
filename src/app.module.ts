import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { BotSettingsModule } from './bot-settings/bot-settings.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { DeliveryLocationsModule } from './delivery-locations/delivery-locations.module';

@Module({
  imports: [PrismaModule, BotSettingsModule, MenuItemsModule, DeliveryLocationsModule],
  controllers: [AppController],
})
export class AppModule {}
