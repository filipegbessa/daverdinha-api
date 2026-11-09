import { Prisma } from '@prisma/client';
import { installmentsFor } from './installments';

const settings = { maxInstallments: 3, minInstallmentValue: 30 };

describe('installmentsFor', () => {
  it('splits up to the maximum while each installment stays above the minimum', () => {
    expect(installmentsFor(100, settings)).toBe(3);
    expect(installmentsFor(60, settings)).toBe(2);
    expect(installmentsFor(new Prisma.Decimal('59.90'), settings)).toBe(1);
  });

  it('never goes below one (cash) nor above the maximum', () => {
    expect(installmentsFor(10, settings)).toBe(1);
    expect(installmentsFor(10_000, settings)).toBe(3);
  });

  it('only uses the maximum when there is no minimum installment', () => {
    expect(
      installmentsFor(5, { maxInstallments: 6, minInstallmentValue: 0 }),
    ).toBe(6);
  });
});
