import { formatOrderCode, parseOrderCode } from './order-code';

describe('order code', () => {
  it('pads the number to four digits', () => {
    expect(formatOrderCode(42)).toBe('DV-0042');
    expect(formatOrderCode(12345)).toBe('DV-12345');
  });

  it('reads back what someone would type', () => {
    expect(parseOrderCode('DV-0042')).toBe(42);
    expect(parseOrderCode('dv42')).toBe(42);
    expect(parseOrderCode(' 0042 ')).toBe(42);
    expect(parseOrderCode('Maria')).toBeNull();
  });
});
