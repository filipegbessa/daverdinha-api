import { Prisma } from '@prisma/client';

/**
 * Quantas parcelas sem juros um pedido pode ter: até o máximo configurado,
 * desde que cada parcela fique em pelo menos o valor mínimo. Nunca menos de
 * 1 (à vista). Ex.: 3x / R$ 30 → R$ 100 em 3x, R$ 60 em 2x, R$ 59,90 à vista.
 */
export function installmentsFor(
  total: Prisma.Decimal | number,
  settings: {
    maxInstallments: number;
    minInstallmentValue: Prisma.Decimal | number;
  },
): number {
  const min = new Prisma.Decimal(settings.minInstallmentValue);
  const byValue = min.lte(0)
    ? settings.maxInstallments
    : new Prisma.Decimal(total).div(min).floor().toNumber();
  return Math.max(1, Math.min(settings.maxInstallments, byValue));
}
