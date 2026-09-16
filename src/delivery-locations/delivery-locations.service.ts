import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

export interface CoveredZone {
  zone: string;
  bairros: string[];
}

@Injectable()
export class DeliveryLocationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  update(id: string, dto: UpdateDeliveryLocationDto) {
    return this.prisma.deliveryLocation.update({ where: { id }, data: dto });
  }
}
