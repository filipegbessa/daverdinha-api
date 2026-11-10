import { MenuItemsController } from './menu-items.controller';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('MenuItemsController', () => {
  it('fica atrás do Clerk: o menu é o que o bot responde aos clientes', () => {
    expect(Reflect.getMetadata('__guards__', MenuItemsController)).toEqual([
      ClerkAuthGuard,
    ]);
  });
});
