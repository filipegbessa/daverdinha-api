import { Module } from '@nestjs/common';
import { DeliveryLocationsService } from './delivery-locations.service';
import { DeliveryLocationsController } from './delivery-locations.controller';
import { PublicDeliveryLocationsController } from './public-delivery-locations.controller';
import { DeliveryAreasService } from './delivery-areas.service';
import { DeliveryAreasController } from './delivery-areas.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { CepLookupModule } from '../cep-lookup/cep-lookup.module';

@Module({
  imports: [ClerkAuthModule, CepLookupModule],
  providers: [DeliveryLocationsService, DeliveryAreasService],
  // The public controller is registered first so `GET /delivery-locations/covered`
  // is matched before the admin controller's guarded routes get a chance.
  controllers: [
    PublicDeliveryLocationsController,
    DeliveryLocationsController,
    DeliveryAreasController,
  ],
  exports: [DeliveryLocationsService, DeliveryAreasService],
})
export class DeliveryLocationsModule {}
