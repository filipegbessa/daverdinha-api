import {
  emptyToNull,
  toBoolean,
  toNullableInt,
  toOptionalBoolean,
  trim,
} from './transforms';

const run = <T>(fn: (args: { value: unknown }) => T, value: unknown) =>
  fn({ value });

describe('transforms', () => {
  it('trim apara string e deixa o resto como veio', () => {
    expect(run(trim, '  Vasos ')).toBe('Vasos');
    expect(run(trim, 42)).toBe(42);
    expect(run(trim, undefined)).toBeUndefined();
  });

  it('emptyToNull troca vazio por null e apara o resto', () => {
    expect(run(emptyToNull, '   ')).toBeNull();
    expect(run(emptyToNull, '')).toBeNull();
    expect(run(emptyToNull, ' interfone 2 ')).toBe('interfone 2');
    expect(run(emptyToNull, null)).toBeNull();
  });

  it('toBoolean só aceita true e "true"', () => {
    expect(run(toBoolean, 'true')).toBe(true);
    expect(run(toBoolean, true)).toBe(true);
    expect(run(toBoolean, 'false')).toBe(false);
    expect(run(toBoolean, '1')).toBe(false);
  });

  it('toOptionalBoolean descarta o que não é booleano', () => {
    expect(run(toOptionalBoolean, 'true')).toBe(true);
    expect(run(toOptionalBoolean, 'false')).toBe(false);
    expect(run(toOptionalBoolean, false)).toBe(false);
    expect(run(toOptionalBoolean, 'talvez')).toBeUndefined();
  });

  it('toNullableInt troca vazio por null e converte o resto', () => {
    expect(run(toNullableInt, '')).toBeNull();
    expect(run(toNullableInt, 'null')).toBeNull();
    expect(run(toNullableInt, null)).toBeNull();
    expect(run(toNullableInt, '7')).toBe(7);
  });
});
