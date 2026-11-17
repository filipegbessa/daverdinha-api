import { Prisma } from '@prisma/client';
import { effectivePrice } from './effective-price';

const now = new Date('2026-11-20T12:00:00Z');
const base = {
  price: new Prisma.Decimal('80.00'),
  promoPrice: new Prisma.Decimal('64.00'),
  promoStartsAt: null,
  promoEndsAt: null,
};
const prices = (p: Parameters<typeof effectivePrice>[0]) => {
  const { price, listPrice } = effectivePrice(p, now);
  return [price.toString(), listPrice?.toString() ?? null];
};

describe('effectivePrice', () => {
  it('uses the promo price with the full price as the crossed-out one', () => {
    expect(prices(base)).toEqual(['64', '80']);
  });

  it('is the full price without a promo', () => {
    expect(prices({ ...base, promoPrice: null })).toEqual(['80', null]);
  });

  it('ignores a promo that is not lower than the price', () => {
    expect(prices({ ...base, promoPrice: new Prisma.Decimal('80') })).toEqual([
      '80',
      null,
    ]);
    expect(prices({ ...base, promoPrice: new Prisma.Decimal('90') })).toEqual([
      '80',
      null,
    ]);
  });

  it('respects the window: not before the start, not from the end on', () => {
    expect(
      prices({ ...base, promoStartsAt: new Date('2026-11-21T00:00:00Z') }),
    ).toEqual(['80', null]);
    expect(
      prices({ ...base, promoEndsAt: new Date('2026-11-20T12:00:00Z') }),
    ).toEqual(['80', null]);
    expect(
      prices({
        ...base,
        promoStartsAt: new Date('2026-11-19T00:00:00Z'),
        promoEndsAt: new Date('2026-11-25T00:00:00Z'),
      }),
    ).toEqual(['64', '80']);
  });
});
