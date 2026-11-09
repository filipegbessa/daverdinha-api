import { Module } from '@nestjs/common';
import { SiteOrdersModule } from '../site-orders/site-orders.module';
import { PublicCheckoutController } from './public-checkout.controller';

@Module({
  imports: [SiteOrdersModule],
  controllers: [PublicCheckoutController],
})
export class CheckoutModule {}
