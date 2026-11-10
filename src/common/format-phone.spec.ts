import { formatPhone, normalizePhone } from './format-phone';

describe('formatPhone', () => {
  it('formats a 9-digit mobile number', () => {
    expect(formatPhone('5521984448130')).toBe('+55 (21) 98444-8130');
  });

  it('formats an 8-digit landline number', () => {
    expect(formatPhone('552133334444')).toBe('+55 (21) 3333-4444');
  });

  it('ignores existing formatting characters in the input', () => {
    expect(formatPhone('+55 (21) 98444-8130')).toBe('+55 (21) 98444-8130');
  });

  it('falls back to the raw input when it does not match the expected shape', () => {
    expect(formatPhone('12345')).toBe('12345');
  });
});

describe('normalizePhone', () => {
  it('reduz qualquer formatação ao formato que o webhook grava', () => {
    expect(normalizePhone('+55 (21) 98444-8130')).toBe('5521984448130');
    expect(normalizePhone('5521984448130')).toBe('5521984448130');
  });

  it('completa o código do país quando só vem DDD + número', () => {
    expect(normalizePhone('(21) 98444-8130')).toBe('5521984448130');
    expect(normalizePhone('21984448130')).toBe('5521984448130');
    expect(normalizePhone('2198444813')).toBe('552198444813');
  });

  it('rejeita o que não tem cara de telefone', () => {
    expect(normalizePhone('João Silva')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});
