import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toMoney } from '../common/money';
import { freeShippingThreshold } from './free-shipping';
import {
  CreateShippingPromotionDto,
  UpdateShippingPromotionDto,
} from './dto/shipping-promotion.dto';

type Db = Prisma.TransactionClient;

const WITH_AREAS = {
  areas: { select: { areaId: true } },
} as const;

type PromotionRow = Prisma.ShippingPromotionGetPayload<{
  include: typeof WITH_AREAS;
}>;

export interface ShippingPromotionAdmin {
  id: string;
  name: string | null;
  minSubtotal: number;
  areaIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
}

function toAdmin(row: PromotionRow): ShippingPromotionAdmin {
  return {
    id: row.id,
    name: row.name,
    minSubtotal: toMoney(row.minSubtotal),
    areaIds: row.areas.map((a) => a.areaId),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Promoções automáticas de frete grátis: o cadastro do admin ("Promoções →
 * Automáticas") e o "a partir de quanto" que o checkout usa. A regra que
 * escolhe a promoção está em `free-shipping.ts`.
 */
@Injectable()
export class ShippingPromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** O menor mínimo de frete grátis que vale agora pra área (`null` = nenhum). */
  async threshold(
    db: Db,
    areaId: string | null,
    now: Date = new Date(),
  ): Promise<Prisma.Decimal | null> {
    const rows = await db.shippingPromotion.findMany({
      where: { active: true },
      include: WITH_AREAS,
    });
    return freeShippingThreshold(
      rows.map((row) => ({
        minSubtotal: row.minSubtotal,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        active: row.active,
        areaIds: row.areas.map((a) => a.areaId),
      })),
      areaId,
      now,
    );
  }

  /** Sem paginação de propósito: são poucas, e o admin vê todas juntas. */
  async list(): Promise<ShippingPromotionAdmin[]> {
    const rows = await this.prisma.shippingPromotion.findMany({
      include: WITH_AREAS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAdmin);
  }

  async create(dto: CreateShippingPromotionDto) {
    assertDates(dto.startsAt, dto.endsAt);
    return toAdmin(
      await this.prisma.shippingPromotion.create({
        data: {
          name: dto.name ?? null,
          minSubtotal: new Prisma.Decimal(dto.minSubtotal),
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          active: dto.active ?? true,
          areas: {
            create: [...new Set(dto.areaIds ?? [])].map((areaId) => ({
              areaId,
            })),
          },
        },
        include: WITH_AREAS,
      }),
    );
  }

  /** As áreas, quando vêm, substituem as anteriores. */
  async update(id: string, dto: UpdateShippingPromotionDto) {
    const current = await this.findRow(id);
    assertDates(
      dto.startsAt !== undefined
        ? dto.startsAt
        : (current.startsAt?.toISOString() ?? null),
      dto.endsAt !== undefined
        ? dto.endsAt
        : (current.endsAt?.toISOString() ?? null),
    );
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.areaIds) {
        await tx.shippingPromotionArea.deleteMany({
          where: { promotionId: id },
        });
      }
      return tx.shippingPromotion.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.minSubtotal !== undefined && {
            minSubtotal: new Prisma.Decimal(dto.minSubtotal),
          }),
          ...(dto.startsAt !== undefined && {
            startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          }),
          ...(dto.endsAt !== undefined && {
            endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          }),
          ...(dto.active !== undefined && { active: dto.active }),
          ...(dto.areaIds && {
            areas: {
              create: [...new Set(dto.areaIds)].map((areaId) => ({ areaId })),
            },
          }),
        },
        include: WITH_AREAS,
      });
    });
    return toAdmin(row);
  }

  async remove(id: string): Promise<void> {
    await this.findRow(id);
    await this.prisma.shippingPromotion.delete({ where: { id } });
  }

  private async findRow(id: string): Promise<PromotionRow> {
    const row = await this.prisma.shippingPromotion.findUnique({
      where: { id },
      include: WITH_AREAS,
    });
    if (!row) throw new NotFoundException('Promoção não encontrada.');
    return row;
  }
}

function assertDates(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
) {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new BadRequestException('O fim precisa ser depois do início.');
  }
}
