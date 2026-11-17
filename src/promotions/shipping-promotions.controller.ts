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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { ShippingPromotionsService } from './shipping-promotions.service';
import {
  CreateShippingPromotionDto,
  UpdateShippingPromotionDto,
} from './dto/shipping-promotion.dto';

/** "Promoções → Automáticas" no admin: frete grátis acima de um valor. */
@ApiTags('shipping-promotions')
@ApiBearerAuth()
@Controller('shipping-promotions')
@UseGuards(ClerkAuthGuard)
export class ShippingPromotionsController {
  constructor(private readonly promotions: ShippingPromotionsService) {}

  @Get()
  list() {
    return this.promotions.list();
  }

  @Post()
  create(@Body() dto: CreateShippingPromotionDto) {
    return this.promotions.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShippingPromotionDto) {
    return this.promotions.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.promotions.remove(id);
  }
}
