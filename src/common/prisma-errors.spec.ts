import {
  isForeignKeyViolation,
  isRecordNotFound,
  isUniqueViolation,
} from './prisma-errors';

describe('isUniqueViolation', () => {
  it('casa P2002 na coluna pedida, com target em array', () => {
    const error = { code: 'P2002', meta: { target: ['name'] } };
    expect(isUniqueViolation(error, 'name')).toBe(true);
    expect(isUniqueViolation(error, 'slug')).toBe(false);
  });

  it('casa P2002 com target em string (nome do índice)', () => {
    const error = { code: 'P2002', meta: { target: 'products_slug_key' } };
    expect(isUniqueViolation(error, 'slug')).toBe(true);
    expect(isUniqueViolation(error, 'name')).toBe(false);
  });

  it('sem coluna, qualquer P2002 serve', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('recusa outro código, null e undefined', () => {
    expect(isUniqueViolation({ code: 'P2003' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined, 'name')).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('casa só P2003', () => {
    expect(isForeignKeyViolation({ code: 'P2003' })).toBe(true);
    expect(isForeignKeyViolation({ code: 'P2002' })).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
  });
});

describe('isRecordNotFound', () => {
  it('casa só P2025', () => {
    expect(isRecordNotFound({ code: 'P2025' })).toBe(true);
    expect(isRecordNotFound({ code: 'P2002' })).toBe(false);
    expect(isRecordNotFound(null)).toBe(false);
  });
});
