import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { SiteOrdersService } from './site-orders.service';
import { ListAttendeesDto } from './dto/list-attendees.dto';
import { CheckInDto } from './dto/check-in.dto';

/**
 * Lista de presença dos eventos. Fica no módulo de pedidos (é leitura dos
 * ingressos), com caminhos completos, pra não acoplar a agenda aos pedidos.
 */
@ApiTags('site-orders')
@ApiBearerAuth()
@Controller()
@UseGuards(ClerkAuthGuard)
export class SiteOrderTicketsController {
  constructor(private readonly orders: SiteOrdersService) {}

  /** Participantes de pedidos pagos, com `sold` e `spots` do evento. */
  @Get('events/:id/attendees')
  listAttendees(@Param('id') id: string, @Query() query: ListAttendeesDto) {
    return this.orders.listAttendees(id, query);
  }

  @Patch('site-order-tickets/:id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: CheckInDto) {
    return this.orders.setCheckIn(id, dto.checkedIn);
  }
}
