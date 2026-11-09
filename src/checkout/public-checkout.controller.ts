import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
}
