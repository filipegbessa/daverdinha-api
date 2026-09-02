import { normalizeText } from './normalize-text';

describe('normalizeText', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeText('Copacábana')).toBe('copacabana');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeText('  Ipanema  ')).toBe('ipanema');
  });

  it('strips punctuation', () => {
    expect(normalizeText('Santo Cristo!')).toBe('santo cristo');
  });
});
