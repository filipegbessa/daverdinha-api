import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { DeliveryLocationsService } from './delivery-locations.service';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Controller('delivery-locations')
@UseGuards(ClerkAuthGuard)
export class DeliveryLocationsController {
  constructor(private readonly service: DeliveryLocationsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryLocationDto) {
    return this.service.update(id, dto);
  }
}
