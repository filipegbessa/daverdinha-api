import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { SiteOrdersService } from '../site-orders/site-orders.service';
import { QuoteDto } from './dto/quote.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import {
  CreateTicketCheckoutDto,
  TicketQuoteDto,
} from './dto/create-ticket-checkout.dto';
import { LookupOrdersDto } from './dto/lookup-orders.dto';

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
    return this.orders.quote(dto.items, dto.cep, dto.couponCode);
  }

  /**
   * Cria o pedido e devolve o link de pagamento. 409 = carrinho mudou
   * (`problems`), 422 = entrega/retirada indisponível (`reason`), 503 = o
   * pagamento não pôde ser iniciado.
   */
  @Post()
  async create(@Body() dto: CreateCheckoutDto) {
    // O id interno fica só pro admin; o site usa o token do link.
    const { code, token, paymentUrl } = await this.orders.create(dto);
    return { code, token, paymentUrl };
  }

  /**
   * Compra de ingresso (ou inscrição gratuita) na página do evento.
   * `paymentUrl: null` = gratuito, já confirmado. 409 com `reason`:
   * `tickets_closed`, `not_available`, `sold_out` ou `too_many`.
   */
  /** O total da compra de ingresso com o cupom, antes de pagar. */
  @Post('tickets/quote')
  @HttpCode(HttpStatus.OK)
  quoteTickets(@Body() dto: TicketQuoteDto) {
    return this.orders.quoteTickets(dto.eventId, dto.quantity, dto.couponCode);
  }

  @Post('tickets')
  createTickets(@Body() dto: CreateTicketCheckoutDto) {
    return this.orders.createTickets(dto);
  }

  /**
   * "Meus pedidos": manda os links dos pedidos pro e-mail. Responde 202
   * igual com ou sem pedido; 429 depois de muitas tentativas.
   */
  @Post('orders/lookup')
  @HttpCode(HttpStatus.ACCEPTED)
  async lookupOrders(@Body() dto: LookupOrdersDto, @Req() req: Request) {
    await this.orders.sendOrderLinks(dto.email, clientIp(req));
    return { message: 'Se houver pedidos nesse e-mail, mandamos os links.' };
  }

  /** A página do pedido, pelo token secreto do link (`/pedido/<token>` no site). */
  @Get('orders/:token')
  findOrder(@Param('token') token: string) {
    return this.orders.findPublicByToken(token);
  }
}

/** O IP de quem chamou: na Vercel vem no `x-forwarded-for` (o primeiro da lista). */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  return first || req.ip || 'unknown';
}
