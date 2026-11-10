import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../common/prisma-errors';
import { toDecimal, toMoney } from '../common/money';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto';
import { UpdateDeliveryAreaDto } from './dto/update-delivery-area.dto';

export interface DeliveryAreaAdmin {
  id: string;
  zone: string;
  name: string;
  fee: number;
  locations: { id: string; regionName: string; covered: boolean }[];
}

export interface DeliveryZoneAreas {
  zone: string;
  areas: DeliveryAreaAdmin[];
  /** Bairros atendidos que ainda não estão em nenhuma área: o site não entrega neles. */
  unassigned: { id: string; regionName: string }[];
}

const DUPLICATE_NAME = 'Já existe uma área com esse nome nessa zona.';

type AreaRow = Prisma.DeliveryAreaGetPayload<{
  include: {
    locations: { select: { id: true; regionName: true; covered: true } };
  };
}>;

const WITH_LOCATIONS = {
  locations: {
    select: { id: true, regionName: true, covered: true },
    orderBy: { regionName: 'asc' as const },
  },
};

function toAdmin(row: AreaRow): DeliveryAreaAdmin {
  return {
    id: row.id,
    zone: row.zone,
    name: row.name,
    fee: toMoney(row.fee),
    locations: row.locations,
  };
}

/**
 * Áreas de entrega do site: subdivisões das zonas, cada uma com o seu valor.
 * Um bairro está em no máximo uma área, sempre da própria zona; bairro sem
 * área não recebe entrega pelo site (nunca vira frete grátis).
 */
@Injectable()
export class DeliveryAreasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sem paginação de propósito: são poucas zonas e poucas áreas por zona, e
   * o admin precisa ver tudo junto pra distribuir os bairros.
   */
  async listByZone(): Promise<DeliveryZoneAreas[]> {
    const [areas, locations] = await Promise.all([
      this.prisma.deliveryArea.findMany({
        include: WITH_LOCATIONS,
        orderBy: { name: 'asc' },
      }),
      this.prisma.deliveryLocation.findMany({
        select: {
          id: true,
          zone: true,
          regionName: true,
          covered: true,
          areaId: true,
        },
        orderBy: { regionName: 'asc' },
      }),
    ]);

    const zones = [
      ...new Set([
        ...locations.map((l) => l.zone),
        ...areas.map((a) => a.zone),
      ]),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return zones.map((zone) => ({
      zone,
      areas: areas.filter((a) => a.zone === zone).map(toAdmin),
      unassigned: locations
        .filter((l) => l.zone === zone && l.covered && !l.areaId)
        .map(({ id, regionName }) => ({ id, regionName })),
    }));
  }

  async create(dto: CreateDeliveryAreaDto): Promise<DeliveryAreaAdmin> {
    const zoneExists = await this.prisma.deliveryLocation.count({
      where: { zone: dto.zone },
    });
    if (zoneExists === 0) throw new NotFoundException('Zona não encontrada.');

    try {
      return toAdmin(
        await this.prisma.deliveryArea.create({
          data: {
            zone: dto.zone,
            name: dto.name,
            fee: toDecimal(dto.fee),
          },
          include: WITH_LOCATIONS,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateDeliveryAreaDto,
  ): Promise<DeliveryAreaAdmin> {
    await this.findRow(id);
    try {
      return toAdmin(
        await this.prisma.deliveryArea.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.fee !== undefined && { fee: toDecimal(dto.fee) }),
          },
          include: WITH_LOCATIONS,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** Os bairros da área ficam sem área (FK `SET NULL`), ou seja, sem entrega pelo site. */
  async remove(id: string): Promise<void> {
    await this.findRow(id);
    await this.prisma.deliveryArea.delete({ where: { id } });
  }

  /** Troca a lista inteira de bairros da área numa transação só. */
  async setLocations(
    id: string,
    locationIds: string[],
  ): Promise<DeliveryAreaAdmin> {
    const area = await this.findRow(id);
    const ids = [...new Set(locationIds)];
    const locations = await this.prisma.deliveryLocation.findMany({
      where: { id: { in: ids } },
      select: { id: true, zone: true },
    });
    if (locations.length !== ids.length) {
      throw new BadRequestException('Bairro não encontrado.');
    }
    if (locations.some((l) => l.zone !== area.zone)) {
      throw new BadRequestException(
        `Só dá pra incluir bairros da zona ${area.zone}.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.deliveryLocation.updateMany({
        where: { areaId: id, id: { notIn: ids } },
        data: { areaId: null },
      }),
      this.prisma.deliveryLocation.updateMany({
        where: { id: { in: ids } },
        data: { areaId: id },
      }),
    ]);
    return toAdmin(await this.findRow(id));
  }

  /** O frete de um bairro, ou `null` se ele não está em nenhuma área. */
  async feeForLocation(
    locationId: string,
  ): Promise<{ area: string; fee: Prisma.Decimal } | null> {
    const location = await this.prisma.deliveryLocation.findUnique({
      where: { id: locationId },
      select: { area: { select: { name: true, fee: true } } },
    });
    if (!location?.area) return null;
    return {
      area: location.area.name,
      fee: new Prisma.Decimal(location.area.fee),
    };
  }

  private async findRow(id: string): Promise<AreaRow> {
    const row = await this.prisma.deliveryArea.findUnique({
      where: { id },
      include: WITH_LOCATIONS,
    });
    if (!row) throw new NotFoundException('Área de entrega não encontrada.');
    return row;
  }

  private mapError(error: unknown) {
    if (isUniqueViolation(error, 'name')) {
      return new ConflictException(DUPLICATE_NAME);
    }
    return error;
  }
}
