import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DeliveryLocationsService } from './delivery-locations.service';
import { CheckCepDto } from './dto/check-cep.dto';

/** O que o site recebe: sem zona nem id, que só servem pro frete. */
export interface CepCheck {
  status: 'covered' | 'not_covered' | 'unresolved';
  bairro?: string;
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
  constructor(private readonly service: DeliveryLocationsService) {}

  @Get('covered')
  listCovered() {
    return this.service.listCoveredByZone();
  }

  /** "Entregamos no seu CEP?" do site, com a mesma resposta que o bot dá. */
  @Get('check')
  async check(@Query() query: CheckCepDto): Promise<CepCheck> {
    const result = await this.service.resolveCep(query.cep ?? '');
    return result.status === 'unresolved'
      ? { status: 'unresolved' }
      : { status: result.status, bairro: result.bairro };
  }
}
