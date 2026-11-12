import { generateTicketCode, normalizeTicketCode } from './ticket-code';

describe('ticket codes', () => {
  it('are two groups of four characters from an alphabet without look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTicketCode()).toMatch(
        /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/,
      );
    }
  });

  it('do not repeat in practice', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateTicketCode));
    expect(codes.size).toBe(1000);
  });

  it('accept what was typed by hand, in any case and with or without the dash', () => {
    expect(normalizeTicketCode(' k7q2m9xp ')).toBe('K7Q2-M9XP');
    expect(normalizeTicketCode('K7Q2-M9XP')).toBe('K7Q2-M9XP');
  });
});
