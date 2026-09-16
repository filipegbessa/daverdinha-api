import { Module } from '@nestjs/common';
import { DeliveryLocationsService } from './delivery-locations.service';
import { DeliveryLocationsController } from './delivery-locations.controller';
import { PublicDeliveryLocationsController } from './public-delivery-locations.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [DeliveryLocationsService],
  // The public controller is registered first so `GET /delivery-locations/covered`
  // is matched before the admin controller's guarded routes get a chance.
  controllers: [PublicDeliveryLocationsController, DeliveryLocationsController],
  exports: [DeliveryLocationsService],
})
export class DeliveryLocationsModule {}
