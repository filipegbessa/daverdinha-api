import { Prisma } from '@prisma/client';
import {
  freeShippingThreshold,
  type ShippingPromotionRule,
} from './free-shipping';

const now = new Date('2026-11-20T15:00:00Z');
const promo = (
  overrides: Partial<ShippingPromotionRule> = {},
): ShippingPromotionRule => ({
  minSubtotal: new Prisma.Decimal(150),
  startsAt: null,
  endsAt: null,
  active: true,
  areaIds: [],
  ...overrides,
});
const threshold = (promos: ShippingPromotionRule[], areaId: string | null) =>
  freeShippingThreshold(promos, areaId, now)?.toString() ?? null;

describe('freeShippingThreshold', () => {
  it('is null without promotions', () => {
    expect(threshold([], 'a1')).toBeNull();
  });

  it('takes the lowest minimum that applies to the area', () => {
    const promos = [
      promo(),
      promo({ minSubtotal: new Prisma.Decimal(100), areaIds: ['a1'] }),
    ];
    expect(threshold(promos, 'a1')).toBe('100');
    expect(threshold(promos, 'a2')).toBe('150');
  });

  it('only counts promotions for every area while the CEP is unknown', () => {
    expect(threshold([promo({ areaIds: ['a1'] })], null)).toBeNull();
    expect(threshold([promo()], null)).toBe('150');
  });

  it('skips inactive, future and finished promotions', () => {
    expect(threshold([promo({ active: false })], 'a1')).toBeNull();
    expect(
      threshold([promo({ startsAt: new Date('2026-11-21T00:00:00Z') })], 'a1'),
    ).toBeNull();
    expect(threshold([promo({ endsAt: now })], 'a1')).toBeNull();
  });
});
