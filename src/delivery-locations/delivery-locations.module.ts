import { Module } from '@nestjs/common';
import { DeliveryLocationsService } from './delivery-locations.service';
import { DeliveryLocationsController } from './delivery-locations.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [DeliveryLocationsService],
  controllers: [DeliveryLocationsController],
  exports: [DeliveryLocationsService],
})
export class DeliveryLocationsModule {}
