import { Prisma } from '@prisma/client';
import { lineTotal, orderTotals, toCents } from './pricing';

describe('pricing', () => {
  it('multiplies without losing a cent', () => {
    expect(lineTotal(new Prisma.Decimal('19.90'), 3).toFixed(2)).toBe('59.70');
  });

  it('adds the lines and the delivery fee exactly', () => {
    const { subtotal, total } = orderTotals(
      [new Prisma.Decimal('0.1'), new Prisma.Decimal('0.2')],
      new Prisma.Decimal('15'),
    );
    expect(subtotal.toFixed(2)).toBe('0.30');
    expect(total.toFixed(2)).toBe('15.30');
  });

  it('converts to whole cents', () => {
    expect(toCents(new Prisma.Decimal('19.90'))).toBe(1990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});
