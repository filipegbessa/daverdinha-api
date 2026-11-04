import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Vaso Terracota M')).toBe('vaso-terracota-m');
  });

  it('strips accents', () => {
    expect(slugify('Suculenta Echévéria')).toBe('suculenta-echeveria');
  });

  it('drops characters that are not letters, numbers or spaces', () => {
    expect(slugify('Kit Jardinagem (iniciante)!')).toBe(
      'kit-jardinagem-iniciante',
    );
  });

  it('collapses repeated whitespace into one hyphen', () => {
    expect(slugify('Arranjo   Tropical')).toBe('arranjo-tropical');
  });

  it('falls back to "item" when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('item');
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    expect(await uniqueSlug('Vasos', async () => false)).toBe('vasos');
  });

  it('appends -2, -3… until it finds a free one', async () => {
    const taken = new Set(['vasos', 'vasos-2']);
    expect(await uniqueSlug('Vasos!', async (s) => taken.has(s))).toBe(
      'vasos-3',
    );
  });
});
