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

  /** A página do pedido, pelo token secreto do link (`/pedido/<token>` no site). */
  @Get('orders/:token')
  findOrder(@Param('token') token: string) {
    return this.orders.findPublicByToken(token);
  }
}
