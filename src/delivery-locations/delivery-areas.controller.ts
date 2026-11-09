import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { DeliveryAreasService } from './delivery-areas.service';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto';
import { UpdateDeliveryAreaDto } from './dto/update-delivery-area.dto';
import { SetAreaLocationsDto } from './dto/set-area-locations.dto';

@ApiTags('delivery-areas')
@ApiBearerAuth()
@Controller('delivery-areas')
@UseGuards(ClerkAuthGuard)
export class DeliveryAreasController {
  constructor(private readonly service: DeliveryAreasService) {}

  @Get()
  list() {
    return this.service.listByZone();
  }

  @Post()
  create(@Body() dto: CreateDeliveryAreaDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryAreaDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Put(':id/locations')
  setLocations(@Param('id') id: string, @Body() dto: SetAreaLocationsDto) {
    return this.service.setLocations(id, dto.locationIds);
  }
}
