import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';

/**
 * Separado do admin pelo mesmo motivo de `PublicProductsController`: "esta
 * rota é pública" é um fato da estrutura. Nada aqui expõe rascunho.
 */
@ApiTags('events')
@Controller('events')
export class PublicEventsController {
  constructor(private readonly service: EventsService) {}

  // Antes de `:slug`: a ordem dos métodos decide o match.
  @Get('upcoming')
  listUpcoming() {
    return this.service.listUpcoming();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findPublishedBySlug(slug);
  }
}
