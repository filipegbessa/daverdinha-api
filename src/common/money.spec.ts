import { Prisma } from '@prisma/client';
import { toDecimal, toMoney, toMoneyOrNull } from './money';

describe('money', () => {
  it('toMoney converte Decimal, string e number em number', () => {
    expect(toMoney(new Prisma.Decimal('89.90'))).toBe(89.9);
    expect(toMoney('35.00')).toBe(35);
    expect(toMoney(12.5)).toBe(12.5);
  });

  it('toMoneyOrNull mantém o null', () => {
    expect(toMoneyOrNull(null)).toBeNull();
    expect(toMoneyOrNull('10.10')).toBe(10.1);
  });

  it('toDecimal grava sem perder centavos', () => {
    const value = toDecimal(0.1);
    expect(value).toBeInstanceOf(Prisma.Decimal);
    expect(value.plus(toDecimal(0.2)).toString()).toBe('0.3');
  });
});
