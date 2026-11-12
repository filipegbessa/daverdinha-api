import { spotsLeft, takenSpots } from './spots';

describe('spotsLeft', () => {
  it('is null when the event has no limit', () => {
    expect(spotsLeft(null, { sold: 5, reserved: 2 })).toBeNull();
  });

  it('subtracts sold and reserved tickets', () => {
    expect(spotsLeft(12, { sold: 5, reserved: 2 })).toBe(5);
  });

  it('never goes negative when the limit was lowered', () => {
    expect(spotsLeft(3, { sold: 5, reserved: 0 })).toBe(0);
  });
});

describe('takenSpots', () => {
  const now = new Date('2026-11-20T10:00:00Z');

  it('counts paid and still-valid pending tickets per event in two grouped queries', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([{ eventId: 'e1', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ eventId: 'e1', _count: { _all: 1 } }]);
    const db = { siteOrderTicket: { groupBy }, $queryRaw: jest.fn() };

    const taken = await takenSpots(db as never, ['e1', 'e2'], now);

    expect(taken.get('e1')).toEqual({ sold: 3, reserved: 1 });
    expect(taken.get('e2')).toEqual({ sold: 0, reserved: 0 });
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[0][0].where.order).toEqual({ status: 'paid' });
    // Pendente vencido, cancelado, expirado e estornado não ocupam vaga.
    expect(groupBy.mock.calls[1][0].where.order).toEqual({
      status: 'pending_payment',
      expiresAt: { gt: now },
    });
  });

  it('skips the database when there is no event', async () => {
    const db = {
      siteOrderTicket: { groupBy: jest.fn() },
      $queryRaw: jest.fn(),
    };

    expect((await takenSpots(db as never, [], now)).size).toBe(0);
    expect(db.siteOrderTicket.groupBy).not.toHaveBeenCalled();
  });
});
