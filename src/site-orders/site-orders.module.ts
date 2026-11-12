import { Module } from '@nestjs/common';
import { DeliveryLocationsModule } from '../delivery-locations/delivery-locations.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { PagarmeModule } from '../pagarme/pagarme.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { EmailModule } from '../email/email.module';
import { SiteOrdersService } from './site-orders.service';
import { SiteOrdersController } from './site-orders.controller';
import { SiteOrderTicketsController } from './site-order-tickets.controller';

@Module({
  imports: [
    ClerkAuthModule,
    DeliveryLocationsModule,
    StoreSettingsModule,
    PagarmeModule,
    PushNotificationsModule,
    EmailModule,
  ],
  providers: [SiteOrdersService],
  controllers: [SiteOrdersController, SiteOrderTicketsController],
  exports: [SiteOrdersService],
})
export class SiteOrdersModule {}
