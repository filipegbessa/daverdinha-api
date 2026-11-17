import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DeliveryLocationsService } from './delivery-locations.service';
import { DeliveryAreasService } from './delivery-areas.service';
import { CheckCepDto } from './dto/check-cep.dto';
import { toMoney } from '../common/money';

/**
 * O que o site recebe: sem zona nem id. `fee` só vem com `covered`: o valor
 * da área de entrega do bairro (o mesmo do `POST /checkout/quote`; zero =
 * entrega grátis).
 */
export interface CepCheck {
  status: 'covered' | 'not_covered' | 'unresolved';
  bairro?: string;
  fee?: number;
}

/**
 * Deliberately a separate controller from the admin one so that "this route
 * is public" is a structural fact rather than a missing decorator someone
 * has to notice. Nothing here may expose anything beyond the delivery areas
 * already printed on the public site.
 */
@ApiTags('delivery-locations')
@Controller('delivery-locations')
export class PublicDeliveryLocationsController {
  constructor(
    private readonly service: DeliveryLocationsService,
    private readonly areas: DeliveryAreasService,
  ) {}

  @Get('covered')
  listCovered() {
    return this.service.listCoveredByZone();
  }

  /**
   * "Entregamos no seu CEP?" do site, com a mesma resposta que o bot dá.
   * A CDN da Vercel guarda a resposta por CEP (a URL) por 10 minutos: o
   * mesmo CEP não chega à função nem à BrasilAPI de novo. Mudar a cobertura
   * no admin leva até esse tempo pra aparecer aqui (o bot não tem cache),
   * e o mesmo vale pro valor do frete (o checkout não usa este cache).
   */
  @Get('check')
  @Header('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600')
  async check(@Query() query: CheckCepDto): Promise<CepCheck> {
    const result = await this.service.resolveCep(query.cep ?? '');
    if (result.status === 'unresolved') return { status: 'unresolved' };
    if (result.status === 'not_covered') {
      return { status: 'not_covered', bairro: result.bairro };
    }
    const area = await this.areas.feeForLocation(result.locationId);
    // A área pode ter sido apagada entre as duas leituras: aí não atende.
    if (!area) return { status: 'not_covered', bairro: result.bairro };
    return { status: 'covered', bairro: result.bairro, fee: toMoney(area.fee) };
  }
}
