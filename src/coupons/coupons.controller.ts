import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { CouponsService } from './coupons.service';
import {
  CreateCouponDto,
  ListCouponsDto,
  UpdateCouponDto,
} from './dto/coupon.dto';

/** "Promoções → Cupons" no admin. */
@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
@UseGuards(ClerkAuthGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Query() query: ListCouponsDto) {
    return this.coupons.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coupons.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  /** Cupom já usado é desativado em vez de apagado (`deleted: false`). */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}
