import { formatPhone } from './format-phone';

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
