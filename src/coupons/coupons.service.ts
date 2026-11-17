import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageBounds, paginated } from '../common/pagination';
import { toMoneyOrNull } from '../common/money';
import { isUniqueViolation } from '../common/prisma-errors';
import {
  applyCoupon,
  type CouponResult,
  type CouponRule,
  type CouponTarget,
} from './apply-coupon';
import {
  CreateCouponDto,
  ListCouponsDto,
  UpdateCouponDto,
} from './dto/coupon.dto';

/** Cliente do Prisma ou transação: a criação do pedido avalia dentro da dela. */
type Db = Prisma.TransactionClient;

const WITH_SCOPE = {
  categories: { select: { categoryId: true } },
  products: { select: { productId: true } },
  events: { select: { eventId: true } },
} as const;

type CouponRow = Prisma.CouponGetPayload<{ include: typeof WITH_SCOPE }>;

export interface CouponAdmin {
  id: string;
  code: string;
  description: string | null;
  type: CouponRow['type'];
  value: number | null;
  maxDiscount: number | null;
  scope: CouponRow['scope'];
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  active: boolean;
  categoryIds: string[];
  productIds: string[];
  eventIds: string[];
  /** Pedidos pagos com o cupom. */
  uses: number;
  /** Pedidos pendentes, ainda no prazo, segurando um uso. */
  reserved: number;
  createdAt: string;
}

/** O resultado da avaliação, com o cupom (pra gravar no pedido). */
export type EvaluatedCoupon =
  | (Extract<CouponResult, { ok: true }> & { couponId: string; code: string })
  | (Extract<CouponResult, { ok: false }> & { code: string });

const NOT_FOUND = 'Cupom não encontrado.';
const DUPLICATE = 'Já existe um cupom com esse código.';

function toRule(row: CouponRow): CouponRule {
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    maxDiscount: row.maxDiscount,
    scope: row.scope,
    minSubtotal: row.minSubtotal,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxUses: row.maxUses,
    categoryIds: row.categories.map((c) => c.categoryId),
    productIds: row.products.map((p) => p.productId),
    eventIds: row.events.map((e) => e.eventId),
  };
}

/** Pedido pago, ou pendente ainda no prazo (segura o uso até pagar ou vencer). */
function holdingUse(now: Date): Prisma.SiteOrderWhereInput {
  return {
    OR: [
      { status: 'paid' },
      { status: 'pending_payment', expiresAt: { gt: now } },
    ],
  };
}

/**
 * Cupons de desconto: o cadastro do admin ("Promoções → Cupons") e a
 * avaliação no checkout. As regras do desconto estão em `apply-coupon.ts`;
 * aqui fica o que precisa do banco (ler o cupom e contar os usos) e as
 * validações do cadastro.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Avalia o código pra um pedido. Com `lock` (criação do pedido, dentro da
   * transação), trava a linha do cupom antes de contar os usos: dois pedidos
   * pelo último uso não passam juntos.
   */
  async evaluate(
    db: Db,
    rawCode: string,
    target: CouponTarget,
    now: Date = new Date(),
    { lock = false }: { lock?: boolean } = {},
  ): Promise<EvaluatedCoupon> {
    const code = rawCode.trim().toUpperCase();
    const row = await db.coupon.findUnique({
      where: { code },
      include: WITH_SCOPE,
    });
    if (!row || !row.active) return { ok: false, error: NOT_FOUND, code };
    if (lock) {
      await db.$queryRaw`SELECT id FROM coupons WHERE id = ${row.id} FOR UPDATE`;
    }
    const usesTaken = await db.siteOrder.count({
      where: { couponId: row.id, ...holdingUse(now) },
    });
    const result = applyCoupon(toRule(row), target, usesTaken, now);
    return result.ok
      ? { ...result, couponId: row.id, code: row.code }
      : { ...result, code: row.code };
  }

  async list(query: ListCouponsDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const q = query.q?.trim();
    const where: Prisma.CouponWhereInput = q
      ? {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        include: WITH_SCOPE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return paginated(await this.withUses(rows), total, page, perPage);
  }

  async findOne(id: string): Promise<CouponAdmin> {
    const [coupon] = await this.withUses([await this.findRow(id)]);
    return coupon;
  }

  async create(dto: CreateCouponDto): Promise<CouponAdmin> {
    this.assertValid(dto);
    try {
      const row = await this.prisma.coupon.create({
        data: {
          ...this.data(dto),
          code: dto.code,
          type: dto.type,
          scope: dto.scope,
        },
        include: WITH_SCOPE,
      });
      return (await this.withUses([row]))[0];
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** As listas do escopo, quando vêm, substituem as anteriores. */
  async update(id: string, dto: UpdateCouponDto): Promise<CouponAdmin> {
    const current = await this.findRow(id);
    this.assertValid({
      type: dto.type ?? current.type,
      scope: dto.scope ?? current.scope,
      value: dto.value !== undefined ? dto.value : toMoneyOrNull(current.value),
      maxDiscount:
        dto.maxDiscount !== undefined
          ? dto.maxDiscount
          : toMoneyOrNull(current.maxDiscount),
      startsAt:
        dto.startsAt !== undefined
          ? dto.startsAt
          : (current.startsAt?.toISOString() ?? null),
      endsAt:
        dto.endsAt !== undefined
          ? dto.endsAt
          : (current.endsAt?.toISOString() ?? null),
      categoryIds:
        dto.categoryIds ?? current.categories.map((c) => c.categoryId),
      productIds: dto.productIds ?? current.products.map((p) => p.productId),
    });
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.categoryIds) {
          await tx.couponCategory.deleteMany({ where: { couponId: id } });
        }
        if (dto.productIds) {
          await tx.couponProduct.deleteMany({ where: { couponId: id } });
        }
        if (dto.eventIds) {
          await tx.couponEvent.deleteMany({ where: { couponId: id } });
        }
        return tx.coupon.update({
          where: { id },
          data: {
            ...this.data(dto),
            ...(dto.code !== undefined && { code: dto.code }),
            ...(dto.type !== undefined && { type: dto.type }),
            ...(dto.scope !== undefined && { scope: dto.scope }),
          },
          include: WITH_SCOPE,
        });
      });
      return (await this.withUses([row]))[0];
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Cupom já usado em algum pedido não é apagado (o pedido guarda o código,
   * mas o relatório perderia o vínculo): é desativado. Sem uso, sai de vez.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    await this.findRow(id);
    const used = await this.prisma.siteOrder.count({ where: { couponId: id } });
    if (used > 0) {
      await this.prisma.coupon.update({
        where: { id },
        data: { active: false },
      });
      return { deleted: false };
    }
    await this.prisma.coupon.delete({ where: { id } });
    return { deleted: true };
  }

  private assertValid(dto: {
    type: CreateCouponDto['type'];
    scope: CreateCouponDto['scope'];
    value?: number | null;
    maxDiscount?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
    categoryIds?: string[];
    productIds?: string[];
  }) {
    if (
      dto.type === 'percent' &&
      !(dto.value && dto.value >= 1 && dto.value <= 100)
    ) {
      throw new BadRequestException('Informe a porcentagem, de 1 a 100.');
    }
    if (dto.type === 'fixed' && !(dto.value && dto.value > 0)) {
      throw new BadRequestException('Informe o valor do desconto.');
    }
    if (dto.type !== 'percent' && dto.maxDiscount) {
      throw new BadRequestException(
        'O desconto máximo só vale para cupom de porcentagem.',
      );
    }
    if (dto.scope === 'categories' && !dto.categoryIds?.length) {
      throw new BadRequestException('Escolha pelo menos uma categoria.');
    }
    if (dto.scope === 'products' && !dto.productIds?.length) {
      throw new BadRequestException('Escolha pelo menos um produto.');
    }
    if (dto.scope === 'events' && dto.type === 'free_shipping') {
      throw new BadRequestException('Ingresso não tem frete.');
    }
    if (
      dto.startsAt &&
      dto.endsAt &&
      new Date(dto.endsAt) <= new Date(dto.startsAt)
    ) {
      throw new BadRequestException('O fim precisa ser depois do início.');
    }
  }

  /** Os campos simples e as listas do escopo, só os que vieram. */
  private data(dto: UpdateCouponDto) {
    const decimal = (v: number | null | undefined) =>
      v === undefined ? undefined : v === null ? null : new Prisma.Decimal(v);
    const date = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null ? null : new Date(v);
    return {
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.value !== undefined && {
        value: dto.type === 'free_shipping' ? null : decimal(dto.value),
      }),
      ...(dto.maxDiscount !== undefined && {
        maxDiscount: decimal(dto.maxDiscount),
      }),
      ...(dto.minSubtotal !== undefined && {
        minSubtotal: decimal(dto.minSubtotal),
      }),
      ...(dto.startsAt !== undefined && { startsAt: date(dto.startsAt) }),
      ...(dto.endsAt !== undefined && { endsAt: date(dto.endsAt) }),
      ...(dto.maxUses !== undefined && { maxUses: dto.maxUses }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.categoryIds && {
        categories: {
          create: [...new Set(dto.categoryIds)].map((categoryId) => ({
            categoryId,
          })),
        },
      }),
      ...(dto.productIds && {
        products: {
          create: [...new Set(dto.productIds)].map((productId) => ({
            productId,
          })),
        },
      }),
      ...(dto.eventIds && {
        events: {
          create: [...new Set(dto.eventIds)].map((eventId) => ({ eventId })),
        },
      }),
    };
  }

  private async withUses(rows: CouponRow[]): Promise<CouponAdmin[]> {
    if (rows.length === 0) return [];
    const now = new Date();
    const ids = rows.map((r) => r.id);
    const [paid, pending] = await Promise.all([
      this.prisma.siteOrder.groupBy({
        by: ['couponId'],
        where: { couponId: { in: ids }, status: 'paid' },
        _count: { _all: true },
      }),
      this.prisma.siteOrder.groupBy({
        by: ['couponId'],
        where: {
          couponId: { in: ids },
          status: 'pending_payment',
          expiresAt: { gt: now },
        },
        _count: { _all: true },
      }),
    ]);
    const count = (list: typeof paid, id: string) =>
      list.find((g) => g.couponId === id)?._count._all ?? 0;
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      description: row.description,
      type: row.type,
      value: toMoneyOrNull(row.value),
      maxDiscount: toMoneyOrNull(row.maxDiscount),
      scope: row.scope,
      minSubtotal: toMoneyOrNull(row.minSubtotal),
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      maxUses: row.maxUses,
      active: row.active,
      categoryIds: row.categories.map((c) => c.categoryId),
      productIds: row.products.map((p) => p.productId),
      eventIds: row.events.map((e) => e.eventId),
      uses: count(paid, row.id),
      reserved: count(pending, row.id),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async findRow(id: string): Promise<CouponRow> {
    const row = await this.prisma.coupon.findUnique({
      where: { id },
      include: WITH_SCOPE,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private mapError(error: unknown) {
    if (isUniqueViolation(error, 'code')) {
      return new ConflictException(DUPLICATE);
    }
    return error;
  }
}
