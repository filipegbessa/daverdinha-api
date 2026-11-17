import { phoneVariants } from './phone-variants';

describe('phoneVariants', () => {
  it('adds the form without the ninth digit to a mobile number', () => {
    expect(phoneVariants('5521984448130')).toEqual([
      '5521984448130',
      '552184448130',
    ]);
  });

  it('adds the ninth digit to an old-style mobile number', () => {
    expect(phoneVariants('552184448130')).toEqual([
      '552184448130',
      '5521984448130',
    ]);
  });

  it('leaves landlines and foreign numbers alone', () => {
    expect(phoneVariants('552133334444')).toEqual(['552133334444']);
    expect(phoneVariants('14155550123')).toEqual(['14155550123']);
  });
});
