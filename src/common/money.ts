import { Prisma } from '@prisma/client';

/**
 * Dinheiro no banco é `Decimal(10, 2)`, que o `JSON.stringify` transforma em
 * string ("89.9"). Toda resposta da API manda preço como `number`, então toda
 * leitura passa por aqui. Conta de dinheiro (soma, frete, parcelas) continua
 * em `Decimal`; só a saída vira `number`.
 */
export function toMoney(value: Prisma.Decimal.Value): number {
  return new Prisma.Decimal(value).toNumber();
}

/** Igual a `toMoney`, pra coluna opcional (`Decimal?`). */
export function toMoneyOrNull(
  value: Prisma.Decimal.Value | null,
): number | null {
  return value === null ? null : toMoney(value);
}

/**
 * O único jeito de gravar: o DTO chega com `number` e vira `Decimal` antes do
 * Prisma, pra o valor nunca passar por conta de ponto flutuante no caminho.
 */
export function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
