import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductCategoriesService } from './product-categories.service';

/**
 * Controller separado do admin pra que "esta rota é pública" seja um fato da
 * estrutura, não um decorator que alguém precisa notar que falta. Só expõe o
 * que o site já mostra.
 */
@ApiTags('product-categories')
@Controller('product-categories')
export class PublicProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get('active')
  listActive() {
    return this.service.listActive();
  }
}
