import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SiteOrdersService } from '../site-orders/site-orders.service';
import { QuoteDto } from './dto/quote.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateTicketCheckoutDto } from './dto/create-ticket-checkout.dto';

/**
 * A loja do site, sem login. Controller público separado, como os outros:
 * "esta rota é aberta" é um fato da estrutura, não um decorator faltando.
 */
@ApiTags('checkout')
@Controller('checkout')
export class PublicCheckoutController {
  constructor(private readonly orders: SiteOrdersService) {}

  /** Preço, estoque e frete do carrinho, sempre calculados no servidor. */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@Body() dto: QuoteDto) {
    return this.orders.quote(dto.items, dto.cep);
  }

  /**
   * Cria o pedido e devolve o link de pagamento. 409 = carrinho mudou
   * (`problems`), 422 = entrega/retirada indisponível (`reason`), 503 = o
   * pagamento não pôde ser iniciado.
   */
  @Post()
  create(@Body() dto: CreateCheckoutDto) {
    return this.orders.create(dto);
  }

  /**
   * Compra de ingresso (ou inscrição gratuita) na página do evento.
   * `paymentUrl: null` = gratuito, já confirmado. 409 com `reason`:
   * `tickets_closed`, `not_available`, `sold_out` ou `too_many`.
   */
  @Post('tickets')
  createTickets(@Body() dto: CreateTicketCheckoutDto) {
    return this.orders.createTickets(dto);
  }

  /** A página do pedido, pelo token secreto do link (`/pedido/<token>` no site). */
  @Get('orders/:token')
  findOrder(@Param('token') token: string) {
    return this.orders.findPublicByToken(token);
  }
}
