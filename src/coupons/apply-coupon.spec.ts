import { Prisma } from '@prisma/client';
import { applyCoupon, type CouponLine, type CouponRule } from './apply-coupon';

const D = (v: string | number) => new Prisma.Decimal(v);
const now = new Date('2026-11-20T15:00:00Z');

function coupon(overrides: Partial<CouponRule> = {}): CouponRule {
  return {
    code: 'BEMVINDA',
    type: 'percent',
    value: D(10),
    maxDiscount: null,
    scope: 'order',
    minSubtotal: null,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    categoryIds: [],
    productIds: [],
    eventIds: [],
    ...overrides,
  };
}

const vaso: CouponLine = {
  productId: 'p1',
  categoryId: 'vasos',
  lineTotal: D('100.00'),
  onPromo: false,
};
const muda: CouponLine = {
  productId: 'p2',
  categoryId: 'mudas',
  lineTotal: D('50.00'),
  onPromo: false,
};
const products = (...lines: CouponLine[]) => ({
  kind: 'products' as const,
  lines,
});
const discountOf = (result: ReturnType<typeof applyCoupon>) =>
  result.ok ? result.discount.toString() : result.error;

describe('applyCoupon', () => {
  it('takes a percentage of the whole order', () => {
    expect(
      discountOf(applyCoupon(coupon(), products(vaso, muda), 0, now)),
    ).toBe('15');
  });

  it('caps a percentage at the maximum discount', () => {
    expect(
      discountOf(
        applyCoupon(
          coupon({ value: D(50), maxDiscount: D(30) }),
          products(vaso, muda),
          0,
          now,
        ),
      ),
    ).toBe('30');
  });

  it('never discounts more than the eligible items', () => {
    expect(
      discountOf(
        applyCoupon(
          coupon({ type: 'fixed', value: D(500) }),
          products(muda),
          0,
          now,
        ),
      ),
    ).toBe('50');
  });

  it('rounds the percentage down to the cent', () => {
    const line = { ...vaso, lineTotal: D('33.33') };
    expect(
      discountOf(applyCoupon(coupon({ value: D(15) }), products(line), 0, now)),
    ).toBe('4.99');
  });

  it('only counts the categories or products in scope', () => {
    expect(
      discountOf(
        applyCoupon(
          coupon({ scope: 'categories', categoryIds: ['mudas'] }),
          products(vaso, muda),
          0,
          now,
        ),
      ),
    ).toBe('5');
    expect(
      discountOf(
        applyCoupon(
          coupon({ scope: 'products', productIds: ['p1'] }),
          products(vaso, muda),
          0,
          now,
        ),
      ),
    ).toBe('10');
    expect(
      discountOf(
        applyCoupon(
          coupon({ scope: 'products', productIds: ['p9'] }),
          products(vaso),
          0,
          now,
        ),
      ),
    ).toBe('Este cupom não vale para os itens do carrinho.');
  });

  it('leaves products on promo out, and says so when only they are in scope', () => {
    const onPromo = { ...vaso, onPromo: true };
    expect(
      discountOf(applyCoupon(coupon(), products(onPromo, muda), 0, now)),
    ).toBe('5');
    expect(discountOf(applyCoupon(coupon(), products(onPromo), 0, now))).toBe(
      'Este cupom não vale para produtos em promoção.',
    );
  });

  it('checks the minimum against the eligible items, without delivery', () => {
    expect(
      discountOf(
        applyCoupon(
          coupon({ minSubtotal: D(200) }),
          products(vaso, muda),
          0,
          now,
        ),
      ),
    ).toBe('Pedido mínimo de R$ 200,00 para este cupom.');
  });

  it('gives free shipping without touching the items', () => {
    const result = applyCoupon(
      coupon({ type: 'free_shipping', value: null }),
      products(vaso),
      0,
      now,
    );
    expect(result).toEqual({ ok: true, discount: D(0), freeShipping: true });
  });

  it('respects the dates and the total uses', () => {
    expect(
      discountOf(
        applyCoupon(
          coupon({ startsAt: new Date('2026-12-01T03:00:00Z') }),
          products(vaso),
          0,
          now,
        ),
      ),
    ).toBe('Este cupom começa em 01/12.');
    expect(
      discountOf(applyCoupon(coupon({ endsAt: now }), products(vaso), 0, now)),
    ).toBe('Cupom expirado.');
    expect(
      discountOf(applyCoupon(coupon({ maxUses: 3 }), products(vaso), 3, now)),
    ).toBe('Este cupom esgotou.');
    expect(
      discountOf(applyCoupon(coupon({ maxUses: 3 }), products(vaso), 2, now)),
    ).toBe('10');
  });

  it('keeps product and ticket coupons apart', () => {
    const tickets = {
      kind: 'tickets' as const,
      eventId: 'e1',
      subtotal: D('90.00'),
    };
    expect(discountOf(applyCoupon(coupon(), tickets, 0, now))).toBe(
      'Este cupom não vale para este evento.',
    );
    expect(
      discountOf(
        applyCoupon(coupon({ scope: 'events' }), products(vaso), 0, now),
      ),
    ).toBe('Este cupom vale só para ingressos de eventos.');
    expect(
      discountOf(applyCoupon(coupon({ scope: 'events' }), tickets, 0, now)),
    ).toBe('9');
    expect(
      discountOf(
        applyCoupon(
          coupon({ scope: 'events', eventIds: ['e2'] }),
          tickets,
          0,
          now,
        ),
      ),
    ).toBe('Este cupom não vale para este evento.');
    expect(
      discountOf(
        applyCoupon(
          coupon({ scope: 'events', type: 'free_shipping', value: null }),
          tickets,
          0,
          now,
        ),
      ),
    ).toBe('Este cupom não vale para este evento.');
  });
});
