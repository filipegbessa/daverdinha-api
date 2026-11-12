import { Test } from '@nestjs/testing';
import { PublicCheckoutController } from './public-checkout.controller';
import { SiteOrdersService } from '../site-orders/site-orders.service';

describe('PublicCheckoutController', () => {
  let controller: PublicCheckoutController;
  let orders: { quote: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    orders = {
      quote: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({
        code: 'DV-0001',
        token: 'tok',
        paymentUrl: 'https://checkout.pagar.me/pl_1',
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicCheckoutController],
      providers: [{ provide: SiteOrdersService, useValue: orders }],
    }).compile();
    controller = moduleRef.get(PublicCheckoutController);
  });

  it('quotes the cart items and CEP', async () => {
    const items = [{ productId: 'p1', quantity: 2 }];

    await controller.quote({ items, cep: '22220-000' });

    expect(orders.quote).toHaveBeenCalledWith(items, '22220-000');
  });

  it('creates the order and returns where to pay', async () => {
    const dto = {
      items: [{ productId: 'p1', quantity: 1 }],
      customer: { name: 'Maria', email: 'm@x.com', phone: '21999998888' },
      deliveryMethod: 'pickup' as const,
    };

    expect(await controller.create(dto)).toEqual({
      code: 'DV-0001',
      token: 'tok',
      paymentUrl: 'https://checkout.pagar.me/pl_1',
    });
    expect(orders.create).toHaveBeenCalledWith(dto);
  });

  it('carries no auth guard: anyone can quote a cart on the site', () => {
    expect(
      Reflect.getMetadata('__guards__', PublicCheckoutController),
    ).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', controller.quote)).toBeUndefined();
  });
});
