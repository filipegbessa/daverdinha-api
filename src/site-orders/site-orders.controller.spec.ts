import { SiteOrdersController } from './site-orders.controller';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('SiteOrdersController', () => {
  it('keeps every order route behind Clerk: orders have addresses and phones', () => {
    expect(Reflect.getMetadata('__guards__', SiteOrdersController)).toEqual([
      ClerkAuthGuard,
    ]);
  });
});
