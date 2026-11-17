import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { CustomersService } from './customers.service';
import { CustomerByPhoneDto } from './dto/customer-by-phone.dto';
import { ListCustomersDto } from './dto/list-customers.dto';

/** "Loja → Clientes" no admin, e a cliente de uma conversa ou de um pedido. */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(ClerkAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersDto) {
    return this.customers.list(query);
  }

  @Get('by-phone')
  byPhone(@Query() query: CustomerByPhoneDto) {
    return this.customers.byPhone(query.phone);
  }
}
