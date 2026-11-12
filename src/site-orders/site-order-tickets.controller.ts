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
import { ListAttendeesDto } from './dto/list-attendees.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckInByCodeDto } from './dto/check-in-by-code.dto';

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

  /**
   * Check-in pelo QR. 404 = código desconhecido; 409 com `reason`:
   * `other_event`, `not_paid` ou `already_checked_in` (com `checkedInAt`).
   */
  @Post('site-order-tickets/check-in-by-code')
  @HttpCode(HttpStatus.OK)
  checkInByCode(@Body() dto: CheckInByCodeDto) {
    return this.orders.checkInByCode(dto.eventId, dto.code);
  }

  @Patch('site-order-tickets/:id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: CheckInDto) {
    return this.orders.setCheckIn(id, dto.checkedIn);
  }
}
