import { Module } from '@nestjs/common';
import { SiteOrdersModule } from '../site-orders/site-orders.module';
import { PagarmeModule } from '../pagarme/pagarme.module';
import { PublicCheckoutController } from './public-checkout.controller';
import { PagarmeWebhookController } from './pagarme-webhook.controller';

@Module({
  imports: [SiteOrdersModule, PagarmeModule],
  controllers: [PublicCheckoutController, PagarmeWebhookController],
})
export class CheckoutModule {}
