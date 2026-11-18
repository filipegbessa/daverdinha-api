import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateHeroSlideDto } from './create-hero-slide.dto';

const errorsFor = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateHeroSlideDto, body)).map(
    (e) => e.property,
  );

describe('CreateHeroSlideDto', () => {
  it('accepts a site path or an http(s) address as the button link', () => {
    expect(errorsFor({ title: 'T', linkUrl: '/produtos/vasos' })).toEqual([]);
    expect(errorsFor({ title: 'T', linkUrl: 'https://wa.me/55' })).toEqual([]);
    expect(errorsFor({ title: 'T', linkUrl: 'javascript:alert(1)' })).toEqual([
      'linkUrl',
    ]);
    expect(errorsFor({ title: 'T', linkUrl: 'produtos' })).toEqual(['linkUrl']);
  });

  it('turns empty form fields into null', () => {
    const dto = plainToInstance(CreateHeroSlideDto, {
      title: ' T ',
      linkUrl: '',
      startsAt: '',
    });
    expect(dto).toMatchObject({ title: 'T', linkUrl: null, startsAt: null });
    expect(validateSync(dto)).toEqual([]);
  });

  it('keeps the texts short enough for the slide', () => {
    expect(errorsFor({ title: 'x'.repeat(81) })).toEqual(['title']);
    expect(errorsFor({ title: 'T', linkLabel: 'x'.repeat(31) })).toEqual([
      'linkLabel',
    ]);
  });
});
