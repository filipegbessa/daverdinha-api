import { Prisma } from '@prisma/client';

/** A promoção de frete grátis como a regra precisa dela. */
export interface ShippingPromotionRule {
  minSubtotal: Prisma.Decimal;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  /** Vazio = todas as áreas de entrega. */
  areaIds: string[];
}

/**
 * O menor "frete grátis acima de" que vale agora pra uma área. Sem área (o
 * CEP ainda não foi digitado), só contam as promoções que valem em todas as
 * áreas: assim o carrinho nunca promete frete grátis pra um bairro que não
 * tem. `null` = nenhuma promoção vale.
 */
export function freeShippingThreshold(
  promotions: ShippingPromotionRule[],
  areaId: string | null,
  now: Date = new Date(),
): Prisma.Decimal | null {
  const valid = promotions.filter(
    (p) =>
      p.active &&
      (!p.startsAt || p.startsAt <= now) &&
      (!p.endsAt || now < p.endsAt) &&
      (p.areaIds.length === 0 ||
        (areaId !== null && p.areaIds.includes(areaId))),
  );
  if (valid.length === 0) return null;
  return valid.reduce(
    (min, p) => (p.minSubtotal.lessThan(min) ? p.minSubtotal : min),
    valid[0].minSubtotal,
  );
}
