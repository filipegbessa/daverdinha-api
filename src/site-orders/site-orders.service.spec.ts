import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { SiteOrdersService } from './site-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { DeliveryAreasService } from '../delivery-locations/delivery-areas.service';
import { StoreSettingsService } from '../store-settings/store-settings.service';

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Vaso M',
    slug: 'vaso-m',
    description: 'd',
    price: new Prisma.Decimal('19.90'),
    images: ['https://blob/vaso.jpg'],
    categoryId: 'c1',
    category: { active: true },
    active: true,
    featured: false,
    order: 0,
    stock: null as number | null,
    leadTimeDays: 10 as number | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const settings = {
  pickupEnabled: true,
  pickupAddress: 'R. Capiberibe, 32',
  pickupHours: 'Seg a sex',
  pickupInstructions: null,
  maxInstallments: 3,
  minInstallmentValue: 30,
  updatedAt: new Date(),
};

describe('SiteOrdersService.quote', () => {
  let service: SiteOrdersService;
  let prisma: {
    product: { findMany: jest.Mock };
    siteOrderItem: { groupBy: jest.Mock };
  };
  let deliveryLocations: { resolveCep: jest.Mock };
  let deliveryAreas: { feeForLocation: jest.Mock };
  let storeSettings: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([product()]) },
      siteOrderItem: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    deliveryLocations = { resolveCep: jest.fn() };
    deliveryAreas = { feeForLocation: jest.fn() };
    storeSettings = { get: jest.fn().mockResolvedValue(settings) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SiteOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveryLocationsService, useValue: deliveryLocations },
        { provide: DeliveryAreasService, useValue: deliveryAreas },
        { provide: StoreSettingsService, useValue: storeSettings },
      ],
    }).compile();
    service = moduleRef.get(SiteOrdersService);
  });

  /** O `findMany` de estoque (em `availableStock`) devolve o mesmo que o de produtos. */
  function withProducts(...rows: ReturnType<typeof product>[]) {
    prisma.product.findMany.mockResolvedValue(rows);
  }

  it('prices from the database and adds up repeated items', async () => {
    const quote = await service.quote([
      { productId: 'p1', quantity: 1 },
      { productId: 'p1', quantity: 2 },
    ]);

    expect(quote.items).toEqual([
      {
        productId: 'p1',
        name: 'Vaso M',
        slug: 'vaso-m',
        unitPrice: 19.9,
        quantity: 3,
        lineTotal: 59.7,
        imageUrl: 'https://blob/vaso.jpg',
        availability: 'made_to_order',
        leadTimeDays: 10,
      },
    ]);
    expect(quote.subtotal).toBe(59.7);
    expect(quote.installments).toBe(1);
  });

  it('turns missing and inactive products into problems, out of the subtotal', async () => {
    withProducts(
      product({ id: 'p2', active: false }),
      product({ id: 'p3', category: { active: false } }),
    );

    const quote = await service.quote([
      { productId: 'gone', quantity: 1 },
      { productId: 'p2', quantity: 1 },
      { productId: 'p3', quantity: 1 },
    ]);

    expect(quote.items).toEqual([]);
    expect(quote.subtotal).toBe(0);
    expect(quote.problems).toEqual([
      { productId: 'gone', reason: 'not_found' },
      { productId: 'p2', reason: 'inactive' },
      { productId: 'p3', reason: 'inactive' },
    ]);
  });

  it('says how many are left when the cart asks for more than the stock, counting reservations', async () => {
    withProducts(product({ stock: 3 }));
    prisma.siteOrderItem.groupBy.mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 1 } },
    ]);

    const quote = await service.quote([{ productId: 'p1', quantity: 3 }]);

    expect(quote.problems).toEqual([
      { productId: 'p1', reason: 'insufficient_stock', available: 2 },
    ]);
  });

  it('marks in-stock lines and hides their lead time', async () => {
    withProducts(product({ stock: 5, leadTimeDays: 10 }));

    const quote = await service.quote([{ productId: 'p1', quantity: 2 }]);

    expect(quote.items[0]).toEqual(
      expect.objectContaining({ availability: 'in_stock', leadTimeDays: null }),
    );
  });

  it('offers installments over the subtotal', async () => {
    withProducts(product({ price: new Prisma.Decimal('50') }));

    const quote = await service.quote([{ productId: 'p1', quantity: 2 }]);

    expect(quote.installments).toBe(3);
  });

  describe('delivery', () => {
    it('is unavailable without a CEP', async () => {
      const quote = await service.quote([{ productId: 'p1', quantity: 1 }]);

      expect(quote.delivery).toEqual({ available: false, reason: 'no_cep' });
      expect(deliveryLocations.resolveCep).not.toHaveBeenCalled();
    });

    it.each([
      [{ status: 'unresolved' }, { available: false, reason: 'unresolved' }],
      [
        { status: 'not_covered', bairro: 'Niterói' },
        { available: false, reason: 'not_covered', bairro: 'Niterói' },
      ],
    ])('is unavailable when the CEP is %j', async (resolution, expected) => {
      deliveryLocations.resolveCep.mockResolvedValue(resolution);

      const quote = await service.quote(
        [{ productId: 'p1', quantity: 1 }],
        '24020-000',
      );

      expect(quote.delivery).toEqual(expected);
    });

    it('is unavailable, never free, for a covered bairro with no area', async () => {
      deliveryLocations.resolveCep.mockResolvedValue({
        status: 'covered',
        bairro: 'Catete',
        zone: 'Zona Sul',
        locationId: 'l1',
      });
      deliveryAreas.feeForLocation.mockResolvedValue(null);

      const quote = await service.quote(
        [{ productId: 'p1', quantity: 1 }],
        '22220000',
      );

      expect(quote.delivery).toEqual({
        available: false,
        reason: 'no_area',
        bairro: 'Catete',
      });
    });

    it('charges the area fee for a covered bairro', async () => {
      deliveryLocations.resolveCep.mockResolvedValue({
        status: 'covered',
        bairro: 'Catete',
        zone: 'Zona Sul',
        locationId: 'l1',
      });
      deliveryAreas.feeForLocation.mockResolvedValue({
        area: 'Perto',
        fee: new Prisma.Decimal('15.00'),
      });

      const quote = await service.quote(
        [{ productId: 'p1', quantity: 1 }],
        '22220000',
      );

      expect(quote.delivery).toEqual({
        available: true,
        fee: 15,
        bairro: 'Catete',
        area: 'Perto',
      });
      expect(deliveryAreas.feeForLocation).toHaveBeenCalledWith('l1');
    });
  });

  describe('pickup', () => {
    it('comes from the store settings', async () => {
      const quote = await service.quote([{ productId: 'p1', quantity: 1 }]);

      expect(quote.pickup).toEqual({
        available: true,
        address: 'R. Capiberibe, 32',
        hours: 'Seg a sex',
        instructions: null,
      });
    });

    it('is not offered when switched off', async () => {
      storeSettings.get.mockResolvedValue({
        ...settings,
        pickupEnabled: false,
      });

      const quote = await service.quote([{ productId: 'p1', quantity: 1 }]);

      expect(quote.pickup).toEqual({ available: false });
    });
  });
});
