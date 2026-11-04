import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ListActiveProductsQuery } from './dto/list-active-products.query';

/**
 * Controller separado do admin pra que "esta rota é pública" seja um fato da
 * estrutura. Só expõe produto ativo de categoria ativa — o que o site mostra.
 */
@ApiTags('products')
@Controller('products')
export class PublicProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get('active')
  listActive(@Query() query: ListActiveProductsQuery) {
    return this.service.listActive(query.category, query.featured);
  }

  @Get('active/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const product = await this.service.findActiveBySlug(slug);
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }
}
