import { SiteOrderTicketsController } from './site-order-tickets.controller';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('SiteOrderTicketsController', () => {
  it('keeps the attendee list behind Clerk: it has names and phones', () => {
    expect(
      Reflect.getMetadata('__guards__', SiteOrderTicketsController),
    ).toEqual([ClerkAuthGuard]);
  });

  it('forwards the attendee list and the check-in', () => {
    const orders = { listAttendees: jest.fn(), setCheckIn: jest.fn() };
    const controller = new SiteOrderTicketsController(orders as never);

    controller.listAttendees('e1', { q: 'mar' });
    controller.checkIn('t1', { checkedIn: true });

    expect(orders.listAttendees).toHaveBeenCalledWith('e1', { q: 'mar' });
    expect(orders.setCheckIn).toHaveBeenCalledWith('t1', true);
  });
});
