import { Module } from '@nestjs/common';
import { DeliveryLocationsModule } from '../delivery-locations/delivery-locations.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { SiteOrdersService } from './site-orders.service';
import { SiteOrdersController } from './site-orders.controller';

@Module({
  imports: [ClerkAuthModule, DeliveryLocationsModule, StoreSettingsModule],
  providers: [SiteOrdersService],
  controllers: [SiteOrdersController],
  exports: [SiteOrdersService],
})
export class SiteOrdersModule {}
