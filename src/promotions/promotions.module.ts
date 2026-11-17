import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { ShippingPromotionsController } from './shipping-promotions.controller';
import { ShippingPromotionsService } from './shipping-promotions.service';

@Module({
  imports: [ClerkAuthModule],
  providers: [ShippingPromotionsService],
  controllers: [ShippingPromotionsController],
  exports: [ShippingPromotionsService],
})
export class PromotionsModule {}
