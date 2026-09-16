import { Controller, Get } from '@nestjs/common';
import { DeliveryLocationsService } from './delivery-locations.service';

/**
 * Deliberately a separate controller from the admin one so that "this route
 * is public" is a structural fact rather than a missing decorator someone
 * has to notice. Nothing here may expose anything beyond the delivery areas
 * already printed on the public site.
 */
@Controller('delivery-locations')
export class PublicDeliveryLocationsController {
  constructor(private readonly service: DeliveryLocationsService) {}

  @Get('covered')
  listCovered() {
    return this.service.listCoveredByZone();
  }
}
