import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { SiteOrdersService } from './site-orders.service';
import { ListSiteOrdersDto } from './dto/list-site-orders.dto';
import { UpdateFulfillmentDto } from './dto/update-fulfillment.dto';

@ApiTags('site-orders')
@ApiBearerAuth()
@Controller('site-orders')
@UseGuards(ClerkAuthGuard)
export class SiteOrdersController {
  constructor(private readonly orders: SiteOrdersService) {}

  @Get()
  list(@Query() query: ListSiteOrdersDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findById(id);
  }

  @Patch(':id/fulfillment')
  updateFulfillment(
    @Param('id') id: string,
    @Body() dto: UpdateFulfillmentDto,
  ) {
    return this.orders.updateFulfillment(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.orders.cancel(id);
  }
}
