import { Prisma } from '@prisma/client';

/**
 * Contas de dinheiro do pedido. Tudo em `Decimal`: `0.1 + 0.2` em `number`
 * não pode virar centavo errado no total que o cliente paga.
 */
export function lineTotal(
  unitPrice: Prisma.Decimal,
  quantity: number,
): Prisma.Decimal {
  return new Prisma.Decimal(unitPrice).mul(quantity);
}

export function orderTotals(
  lineTotals: Prisma.Decimal[],
  deliveryFee: Prisma.Decimal,
): { subtotal: Prisma.Decimal; total: Prisma.Decimal } {
  const subtotal = lineTotals.reduce(
    (sum, line) => sum.add(line),
    new Prisma.Decimal(0),
  );
  return { subtotal, total: subtotal.add(deliveryFee) };
}

/** Reais → centavos inteiros, que é como o gateway de pagamento recebe. */
export function toCents(value: Prisma.Decimal | number): number {
  return new Prisma.Decimal(value).mul(100).toDecimalPlaces(0).toNumber();
}
