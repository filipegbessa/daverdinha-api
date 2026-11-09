import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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

describe('SiteOrdersService orders', () => {
  let service: SiteOrdersService;
  let prisma: {
    siteOrder: Record<string, jest.Mock>;
    product: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  function order(overrides: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      number: 42,
      publicToken: 'tok',
      kind: 'products',
      status: 'paid',
      fulfillmentStatus: 'awaiting',
      customerName: 'Maria Souza',
      customerEmail: 'maria@exemplo.com',
      customerPhone: '5521999998888',
      deliveryMethod: 'delivery',
      cep: '22220000',
      street: 'Rua do Catete',
      streetNumber: '100',
      complement: null,
      bairro: 'Catete',
      deliveryZone: 'Zona Sul',
      deliveryArea: 'Perto',
      notes: null,
      subtotal: new Prisma.Decimal('89.90'),
      deliveryFee: new Prisma.Decimal('15.00'),
      total: new Prisma.Decimal('104.90'),
      gatewayLinkId: null,
      gatewayOrderId: null,
      gatewayChargeId: null,
      gatewayStatus: null,
      paymentUrl: 'https://pay',
      paidAt: new Date('2026-11-09T12:00:00Z'),
      expiresAt: new Date('2026-11-09T13:00:00Z'),
      lastSyncedAt: null,
      createdAt: new Date('2026-11-09T12:00:00Z'),
      updatedAt: new Date('2026-11-09T12:00:00Z'),
      items: [
        {
          id: 'i1',
          orderId: 'o1',
          productId: 'p1',
          productName: 'Vaso M',
          productSlug: 'vaso-m',
          imageUrl: null,
          unitPrice: new Prisma.Decimal('89.90'),
          quantity: 2,
          leadTimeDays: null,
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      siteOrder: {
        findUnique: jest.fn().mockResolvedValue(order()),
        findMany: jest.fn().mockResolvedValue([order()]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(({ data }) => order(data)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: { updateMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SiteOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveryLocationsService, useValue: {} },
        { provide: DeliveryAreasService, useValue: {} },
        {
          provide: StoreSettingsService,
          useValue: { get: jest.fn().mockResolvedValue(settings) },
        },
      ],
    }).compile();
    service = moduleRef.get(SiteOrdersService);
  });

  describe('findPublicByToken', () => {
    it('finds by the secret token and never shows the street, phone or e-mail', async () => {
      const result = await service.findPublicByToken('tok');

      expect(prisma.siteOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { publicToken: 'tok' } }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          code: 'DV-0042',
          bairro: 'Catete',
          total: 104.9,
          paymentUrl: null,
        }),
      );
      const text = JSON.stringify(result);
      for (const secret of [
        'Rua do Catete',
        '5521999998888',
        'maria@exemplo.com',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('is a 404 for an unknown token', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(null);

      await expect(service.findPublicByToken('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('turns a pending order past its deadline into expired, without a cron', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        order({ status: 'pending_payment', expiresAt: new Date('2020-01-01') }),
      );

      const result = await service.findPublicByToken('tok');

      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: 'pending_payment' },
        data: { status: 'expired' },
      });
      expect(result.status).toBe('expired');
      expect(result.paymentUrl).toBeNull();
    });

    it('shows the payment link only while pending, and the pickup details for pickup orders', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        order({
          status: 'pending_payment',
          expiresAt: new Date(Date.now() + 60_000),
          deliveryMethod: 'pickup',
        }),
      );

      const result = await service.findPublicByToken('tok');

      expect(result.paymentUrl).toBe('https://pay');
      expect(result.pickup).toEqual({
        address: 'R. Capiberibe, 32',
        hours: 'Seg a sex',
        instructions: null,
      });
    });
  });

  describe('list', () => {
    it('shows only paid orders by default, newest first', async () => {
      const result = await service.list({});

      expect(prisma.siteOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'paid' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          code: 'DV-0042',
          customer: expect.objectContaining({ phone: '5521999998888' }),
          address: expect.objectContaining({ street: 'Rua do Catete' }),
        }),
      );
    });

    it('searches by order code or buyer name, with status and kind', async () => {
      await service.list({
        q: 'DV-0042',
        status: 'pending_payment',
        kind: 'products',
      });

      expect(prisma.siteOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'pending_payment',
            kind: 'products',
            OR: [
              { customerName: { contains: 'DV-0042', mode: 'insensitive' } },
              { number: 42 },
            ],
          },
        }),
      );

      await service.list({ q: 'maria' });
      expect(prisma.siteOrder.count).toHaveBeenLastCalledWith({
        where: {
          status: 'paid',
          OR: [{ customerName: { contains: 'maria', mode: 'insensitive' } }],
        },
      });
    });
  });

  describe('updateFulfillment', () => {
    it('only changes a paid order', async () => {
      await service.updateFulfillment('o1', { fulfillmentStatus: 'ready' });
      expect(prisma.siteOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fulfillmentStatus: 'ready' } }),
      );

      prisma.siteOrder.findUnique.mockResolvedValue(
        order({
          status: 'pending_payment',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );
      await expect(
        service.updateFulfillment('o1', { fulfillmentStatus: 'ready' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('cancels a paid order and puts its units back in stock', async () => {
      await service.cancel('o1');

      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: 'paid' },
        data: { status: 'cancelled' },
      });
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', stock: { not: null } },
        data: { stock: { increment: 2 } },
      });
    });

    it('cancels a pending order without touching the stock, which was only reserved', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        order({
          status: 'pending_payment',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      await service.cancel('o1');

      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an order that is already closed', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        order({ status: 'refunded' }),
      );

      await expect(service.cancel('o1')).rejects.toThrow(ConflictException);
      expect(prisma.siteOrder.updateMany).not.toHaveBeenCalled();
    });

    it('does not put stock back when the status changed in the meantime', async () => {
      prisma.siteOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel('o1')).rejects.toThrow(ConflictException);
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });
  });
});
