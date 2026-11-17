import { Prisma } from '@prisma/client';
import { toMoney } from '../common/money';
import { formatBrl } from '../email/templates/layout';

/** O cupom como as regras precisam dele (com as listas do escopo já lidas). */
export interface CouponRule {
  code: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: Prisma.Decimal | null;
  maxDiscount: Prisma.Decimal | null;
  scope: 'order' | 'categories' | 'products' | 'events';
  minSubtotal: Prisma.Decimal | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  categoryIds: string[];
  productIds: string[];
  eventIds: string[];
}

/** Uma linha do pedido, do jeito que o cupom olha pra ela. */
export interface CouponLine {
  productId: string;
  categoryId: string;
  lineTotal: Prisma.Decimal;
  /** Em preço promocional: fica fora do cupom (não acumula). */
  onPromo: boolean;
}

export type CouponTarget =
  | { kind: 'products'; lines: CouponLine[] }
  | { kind: 'tickets'; eventId: string; subtotal: Prisma.Decimal };

export type CouponResult =
  | { ok: true; discount: Prisma.Decimal; freeShipping: boolean }
  | { ok: false; error: string };

const ZERO = new Prisma.Decimal(0);

function money(value: Prisma.Decimal): string {
  return formatBrl(toMoney(value));
}

function day(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * As regras do cupom, num lugar só e sem banco (o serviço lê o cupom e os
 * usos e chama aqui). Um benefício por cupom e um cupom por pedido; o
 * desconto incide só sobre os itens do escopo, nunca sobre item em preço
 * promocional nem sobre o frete (que só o `free_shipping` zera); valor fixo
 * maior que a base para na base. As mensagens aparecem no campo do cupom.
 */
export function applyCoupon(
  coupon: CouponRule,
  target: CouponTarget,
  usesTaken: number,
  now: Date = new Date(),
): CouponResult {
  if (coupon.startsAt && coupon.startsAt > now) {
    return {
      ok: false,
      error: `Este cupom começa em ${day(coupon.startsAt)}.`,
    };
  }
  if (coupon.endsAt && coupon.endsAt <= now) {
    return { ok: false, error: 'Cupom expirado.' };
  }
  if (coupon.maxUses !== null && usesTaken >= coupon.maxUses) {
    return { ok: false, error: 'Este cupom esgotou.' };
  }

  let base: Prisma.Decimal;
  if (target.kind === 'tickets') {
    const forEvent =
      coupon.scope === 'events' &&
      (coupon.eventIds.length === 0 ||
        coupon.eventIds.includes(target.eventId));
    if (!forEvent || coupon.type === 'free_shipping') {
      return { ok: false, error: 'Este cupom não vale para este evento.' };
    }
    base = target.subtotal;
  } else {
    if (coupon.scope === 'events') {
      return {
        ok: false,
        error: 'Este cupom vale só para ingressos de eventos.',
      };
    }
    const inScope = target.lines.filter(
      (line) =>
        coupon.scope === 'order' ||
        (coupon.scope === 'categories' &&
          coupon.categoryIds.includes(line.categoryId)) ||
        (coupon.scope === 'products' &&
          coupon.productIds.includes(line.productId)),
    );
    if (inScope.length === 0) {
      return {
        ok: false,
        error: 'Este cupom não vale para os itens do carrinho.',
      };
    }
    const eligible = inScope.filter((line) => !line.onPromo);
    if (eligible.length === 0) {
      return {
        ok: false,
        error: 'Este cupom não vale para produtos em promoção.',
      };
    }
    base = eligible.reduce((sum, line) => sum.add(line.lineTotal), ZERO);
  }

  if (coupon.minSubtotal && base.lessThan(coupon.minSubtotal)) {
    return {
      ok: false,
      error: `Pedido mínimo de ${money(coupon.minSubtotal)} para este cupom.`,
    };
  }

  if (coupon.type === 'free_shipping') {
    return { ok: true, discount: ZERO, freeShipping: true };
  }
  const value = coupon.value ?? ZERO;
  let discount =
    coupon.type === 'percent'
      ? base.mul(value).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
      : value;
  if (
    coupon.type === 'percent' &&
    coupon.maxDiscount &&
    discount.greaterThan(coupon.maxDiscount)
  ) {
    discount = coupon.maxDiscount;
  }
  if (discount.greaterThan(base)) discount = base;
  return { ok: true, discount, freeShipping: false };
}
