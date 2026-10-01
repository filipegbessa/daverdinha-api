import { isWindowExpired, WHATSAPP_WINDOW_MS } from './whatsapp-window';

describe('isWindowExpired', () => {
  it('returns true for null (no inbound message has ever arrived)', () => {
    expect(isWindowExpired(null)).toBe(true);
  });

  it('returns false for a timestamp within the last 24h', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(isWindowExpired(oneHourAgo)).toBe(false);
  });

  it('returns true for a timestamp more than 24h old', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isWindowExpired(twentyFiveHoursAgo)).toBe(true);
  });

  it('returns false exactly at the boundary minus one second', () => {
    const justUnder = new Date(Date.now() - WHATSAPP_WINDOW_MS + 1000);
    expect(isWindowExpired(justUnder)).toBe(false);
  });
});
