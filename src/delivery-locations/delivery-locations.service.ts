import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CepLookupService } from '../cep-lookup/cep-lookup.service';
import { normalizeText } from '../common/normalize-text';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

export interface CoveredZone {
  zone: string;
  bairros: string[];
}

/**
 * Para onde um CEP leva. `covered`/`not_covered` com `locationId` e `zone`
 * quando o bairro é um dos nossos; `not_covered` só com o `bairro` quando a
 * BrasilAPI achou um bairro que não está na lista; `unresolved` quando não
 * deu pra saber (formato errado, BrasilAPI fora do ar ou sem resposta).
 */
export type CepResolution =
  | { status: 'covered'; bairro: string; zone: string; locationId: string }
  | {
      status: 'not_covered';
      bairro: string;
      zone?: string;
      locationId?: string;
    }
  | { status: 'unresolved' };

@Injectable()
export class DeliveryLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cepLookup: CepLookupService,
  ) {}

  list() {
    return this.prisma.deliveryLocation.findMany({
      orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
      include: { cepRanges: true },
    });
  }

  /**
   * What the public site advertises under "Onde entregamos", grouped by
   * administrative zone. Reads the same `covered` flags the bot answers
   * from, so the site can't promise a bairro the bot turns away — which is
   * exactly what happened while that list was hardcoded in the frontend.
   */
  async listCoveredByZone(): Promise<CoveredZone[]> {
    const locations = await this.prisma.deliveryLocation.findMany({
      where: { covered: true },
      orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
      select: { zone: true, regionName: true },
    });

    const byZone = new Map<string, string[]>();
    for (const { zone, regionName } of locations) {
      const bairros = byZone.get(zone) ?? [];
      bairros.push(regionName);
      byZone.set(zone, bairros);
    }

    return [...byZone.entries()].map(([zone, bairros]) => ({ zone, bairros }));
  }

  /**
   * A mesma resposta pro bot e pro site. As faixas de CEP cadastradas ganham
   * da BrasilAPI: foram curadas pela dona e continuam valendo mesmo se a
   * BrasilAPI discordar ou estiver fora do ar.
   */
  async resolveCep(rawCep: string): Promise<CepResolution> {
    const cep = rawCep.replace(/\D/g, '');
    if (cep.length !== 8) return { status: 'unresolved' };
    const cepNumber = Number(cep);

    const locations = await this.list();
    const localMatch = locations.find((loc) =>
      loc.cepRanges.some(
        (range) => cepNumber >= range.startCep && cepNumber <= range.endCep,
      ),
    );
    if (localMatch) return fromLocation(localMatch);

    const lookup = await this.cepLookup.lookup(cep);
    if (!lookup) return { status: 'unresolved' };

    const normalizedBairro = normalizeText(lookup.bairro);
    const apiMatch = locations.find(
      (loc) => normalizeText(loc.regionName) === normalizedBairro,
    );
    if (apiMatch) return fromLocation(apiMatch);

    return { status: 'not_covered', bairro: lookup.bairro };
  }

  update(id: string, dto: UpdateDeliveryLocationDto) {
    return this.prisma.deliveryLocation.update({ where: { id }, data: dto });
  }
}

function fromLocation(location: {
  id: string;
  zone: string;
  regionName: string;
  covered: boolean;
}): CepResolution {
  const match = {
    bairro: location.regionName,
    zone: location.zone,
    locationId: location.id,
  };
  return location.covered
    ? { status: 'covered', ...match }
    : { status: 'not_covered', ...match };
}
