import { Module } from '@nestjs/common';
import { DeliveryLocationsModule } from '../delivery-locations/delivery-locations.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { SiteOrdersService } from './site-orders.service';

@Module({
  imports: [DeliveryLocationsModule, StoreSettingsModule],
  providers: [SiteOrdersService],
  exports: [SiteOrdersService],
})
export class SiteOrdersModule {}
