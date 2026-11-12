import { Test } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SiteOrdersService } from './site-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { DeliveryAreasService } from '../delivery-locations/delivery-areas.service';
import { StoreSettingsService } from '../store-settings/store-settings.service';
import { PAYMENT_GATEWAY } from '../pagarme/payment-gateway';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

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
  siteEnabled: true,
  storeEnabled: true,
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
        { provide: PAYMENT_GATEWAY, useValue: {} },
        { provide: PushNotificationsService, useValue: {} },
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
  let gateway: {
    createCheckout: jest.Mock;
    getCharge: jest.Mock;
    findChargesForLink: jest.Mock;
  };
  let push: { notifyNewOrder: jest.Mock };
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
    gateway = {
      createCheckout: jest.fn(),
      getCharge: jest.fn(),
      findChargesForLink: jest.fn().mockResolvedValue([]),
    };
    push = { notifyNewOrder: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      siteOrder: {
        findUnique: jest.fn().mockResolvedValue(order()),
        findFirst: jest.fn().mockResolvedValue(order()),
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
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: PushNotificationsService, useValue: push },
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
  describe('applyGatewayCharge', () => {
    const paidCharge = {
      id: 'ch_1',
      orderId: 'or_1',
      orderCode: 'DV-0042',
      status: 'paid' as const,
      amountCents: 10490,
      paidAt: '2026-11-09T12:10:00Z',
      rawStatus: 'paid',
    };

    beforeEach(() => {
      prisma.siteOrder.findFirst.mockResolvedValue(
        order({ status: 'pending_payment', paidAt: null }),
      );
    });

    it('finds the order by the gateway order or by our DV code', async () => {
      await service.applyGatewayCharge(paidCharge);

      expect(prisma.siteOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ gatewayOrderId: 'or_1' }, { number: 42 }] },
        }),
      );
    });

    it('marks the order paid, takes the stock and notifies once', async () => {
      await service.applyGatewayCharge(paidCharge);

      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: { not: 'paid' } },
        data: expect.objectContaining({
          status: 'paid',
          gatewayChargeId: 'ch_1',
          gatewayOrderId: 'or_1',
          gatewayStatus: 'paid',
          paidAt: new Date('2026-11-09T12:10:00Z'),
        }),
      });
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', stock: { not: null } },
        data: { stock: { decrement: 2 } },
      });
      expect(push.notifyNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o1', code: 'DV-0042', late: false }),
      );
    });

    it('does nothing more when the same payment arrives again', async () => {
      prisma.siteOrder.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValue({ count: 0 });

      await service.applyGatewayCharge(paidCharge);
      await service.applyGatewayCharge(paidCharge);
      await service.applyGatewayCharge(paidCharge);

      expect(prisma.product.updateMany).toHaveBeenCalledTimes(1);
      expect(push.notifyNewOrder).toHaveBeenCalledTimes(1);
    });

    it('does not mark paid when the amount differs from the total', async () => {
      await service.applyGatewayCharge({ ...paidCharge, amountCents: 100 });

      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { gatewayStatus: 'paid', gatewayOrderId: 'or_1' },
      });
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(push.notifyNewOrder).not.toHaveBeenCalled();
    });

    it('ignores a charge that is not ours', async () => {
      prisma.siteOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.applyGatewayCharge({
          ...paidCharge,
          orderId: 'or_x',
          orderCode: 'XYZ',
        }),
      ).resolves.toBeUndefined();
      expect(prisma.siteOrder.updateMany).not.toHaveBeenCalled();
    });

    it('never looks an order up by a code that is not ours', async () => {
      await service.applyGatewayCharge({
        ...paidCharge,
        orderId: null,
        orderCode: '42',
      });

      expect(prisma.siteOrder.findFirst).not.toHaveBeenCalled();
    });

    it('only records a failed attempt: the buyer can try again until it expires', async () => {
      await service.applyGatewayCharge({
        ...paidCharge,
        status: 'failed',
        amountCents: 0,
        rawStatus: 'failed',
      });

      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { gatewayStatus: 'failed', gatewayOrderId: 'or_1' },
      });
      expect(push.notifyNewOrder).not.toHaveBeenCalled();
    });

    it('still accepts a payment that lands after the order expired, with a warning', async () => {
      prisma.siteOrder.findFirst.mockResolvedValue(
        order({ status: 'expired', paidAt: null }),
      );

      await service.applyGatewayCharge(paidCharge);

      expect(push.notifyNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({ late: true }),
      );
    });

    it('turns a refund of a paid order into refunded and puts the stock back', async () => {
      prisma.siteOrder.findFirst.mockResolvedValue(order({ status: 'paid' }));

      await service.applyGatewayCharge({
        ...paidCharge,
        status: 'refunded',
        rawStatus: 'canceled',
      });

      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: 'paid' },
        data: expect.objectContaining({ status: 'refunded' }),
      });
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', stock: { not: null } },
        data: { stock: { increment: 2 } },
      });
    });
  });

  describe('payment reconciliation', () => {
    const pending = (overrides: Record<string, unknown> = {}) =>
      order({
        status: 'pending_payment',
        paidAt: null,
        gatewayLinkId: 'pl_1',
        expiresAt: new Date(Date.now() + 30 * 60_000),
        ...overrides,
      });

    it('asks the gateway about a pending order when its page is read', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(pending());

      await service.findPublicByToken('tok');

      expect(gateway.findChargesForLink).toHaveBeenCalledWith(
        'pl_1',
        'DV-0042',
      );
      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { lastSyncedAt: expect.any(Date) },
      });
    });

    it('does not ask again within a minute', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        pending({ lastSyncedAt: new Date(Date.now() - 10_000) }),
      );

      await service.findPublicByToken('tok');

      expect(gateway.findChargesForLink).not.toHaveBeenCalled();
    });

    it('applies each charge found, so a missed webhook still marks the order paid', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(pending());
      prisma.siteOrder.findFirst.mockResolvedValue(pending());
      gateway.findChargesForLink.mockResolvedValue([
        {
          id: 'ch_1',
          orderId: 'or_1',
          orderCode: 'DV-0042',
          status: 'paid',
          amountCents: 10490,
          paidAt: null,
          rawStatus: 'paid',
        },
      ]);

      await service.findPublicByToken('tok');

      expect(push.notifyNewOrder).toHaveBeenCalledTimes(1);
    });

    it('still shows the page when the gateway is down', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(pending());
      gateway.findChargesForLink.mockRejectedValue(new Error('timeout'));

      const result = await service.findPublicByToken('tok');

      expect(result.status).toBe('pending_payment');
    });

    it('does not ask about orders that are no longer pending', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        order({ gatewayLinkId: 'pl_1' }),
      );

      await service.findPublicByToken('tok');

      expect(gateway.findChargesForLink).not.toHaveBeenCalled();
    });

    it('lets the admin force a check, and says so when the gateway is down', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        pending({ lastSyncedAt: new Date() }),
      );

      await service.sync('o1');
      expect(gateway.findChargesForLink).toHaveBeenCalledTimes(1);

      gateway.findChargesForLink.mockRejectedValue(new Error('timeout'));
      await expect(service.sync('o1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});

describe('SiteOrdersService.create', () => {
  let service: SiteOrdersService;
  let prisma: {
    product: { findMany: jest.Mock };
    siteOrderItem: { groupBy: jest.Mock };
    siteOrder: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let deliveryLocations: { resolveCep: jest.Mock };
  let deliveryAreas: { feeForLocation: jest.Mock };
  let storeSettings: { get: jest.Mock };
  let gateway: { createCheckout: jest.Mock };
  const now = new Date('2026-11-12T12:00:00Z');

  const dto = (overrides: Record<string, unknown> = {}) => ({
    items: [{ productId: 'p1', quantity: 2 }],
    customer: {
      name: 'Maria Souza',
      email: 'maria@exemplo.com',
      phone: '(21) 99999-8888',
    },
    deliveryMethod: 'delivery' as const,
    address: {
      cep: '22220-000',
      street: 'Rua do Catete',
      number: '100',
    },
    ...overrides,
  });

  beforeEach(async () => {
    process.env.SITE_URL = 'https://www.daverdinha.com.br';
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([product({ stock: 5 })]),
      },
      siteOrderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      siteOrder: {
        create: jest.fn(({ data }) => ({
          id: 'o9',
          number: 7,
          publicToken: 'tok9',
          status: 'pending_payment',
          ...data,
          items: data.items.create.map((item: object, i: number) => ({
            id: `i${i}`,
            ...item,
          })),
        })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    deliveryLocations = {
      resolveCep: jest.fn().mockResolvedValue({
        status: 'covered',
        bairro: 'Catete',
        zone: 'Zona Sul',
        locationId: 'l1',
      }),
    };
    deliveryAreas = {
      feeForLocation: jest
        .fn()
        .mockResolvedValue({ fee: new Prisma.Decimal('12.50'), area: 'Perto' }),
    };
    storeSettings = { get: jest.fn().mockResolvedValue(settings) };
    gateway = {
      createCheckout: jest.fn().mockResolvedValue({
        gatewayLinkId: 'pl_9',
        paymentUrl: 'https://checkout.pagar.me/pl_9',
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SiteOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveryLocationsService, useValue: deliveryLocations },
        { provide: DeliveryAreasService, useValue: deliveryAreas },
        { provide: StoreSettingsService, useValue: storeSettings },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: PushNotificationsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(SiteOrdersService);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
  });

  it('creates the order from database prices and returns the payment link', async () => {
    const result = await service.create(dto(), now);

    expect(result).toEqual({
      code: 'DV-0007',
      token: 'tok9',
      paymentUrl: 'https://checkout.pagar.me/pl_9',
    });
    const data = prisma.siteOrder.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        customerPhone: '5521999998888',
        cep: '22220000',
        bairro: 'Catete',
        deliveryZone: 'Zona Sul',
        deliveryArea: 'Perto',
        expiresAt: new Date('2026-11-12T13:00:00Z'),
      }),
    );
    expect(data.subtotal.toString()).toBe('39.8');
    expect(data.deliveryFee.toString()).toBe('12.5');
    expect(data.total.toString()).toBe('52.3');
    expect(data.items.create).toEqual([
      expect.objectContaining({
        productId: 'p1',
        productName: 'Vaso M',
        quantity: 2,
        leadTimeDays: null,
      }),
    ]);
    expect(prisma.siteOrder.update).toHaveBeenCalledWith({
      where: { id: 'o9' },
      data: {
        gatewayLinkId: 'pl_9',
        paymentUrl: 'https://checkout.pagar.me/pl_9',
      },
    });
  });

  it('locks the products and hands the gateway the order id, code and deadline', async () => {
    await service.create(dto(), now);

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'o9',
        code: 'DV-0007',
        successUrl: 'https://www.daverdinha.com.br/pedido/tok9',
        maxInstallments: 1,
        expiresAt: new Date('2026-11-12T13:00:00Z'),
      }),
    );
  });

  it('is a 409 with the problems when the cart changed', async () => {
    prisma.product.findMany.mockResolvedValue([product({ stock: 1 })]);

    const error = await service.create(dto(), now).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        problems: [
          { productId: 'p1', reason: 'insufficient_stock', available: 1 },
        ],
      }),
    );
    expect(prisma.siteOrder.create).not.toHaveBeenCalled();
  });

  it('is a 422 when it does not deliver to the address', async () => {
    deliveryAreas.feeForLocation.mockResolvedValue(null);

    const error = await service.create(dto(), now).catch((e) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ reason: 'no_area' }),
    );
  });

  it('is a 422 for pickup when pickup is switched off', async () => {
    storeSettings.get.mockResolvedValue({ ...settings, pickupEnabled: false });

    const error = await service
      .create(dto({ deliveryMethod: 'pickup', address: undefined }), now)
      .catch((e) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ reason: 'pickup_disabled' }),
    );
  });

  it('charges no fee on pickup and ignores the address', async () => {
    await service.create(dto({ deliveryMethod: 'pickup' }), now);

    expect(deliveryLocations.resolveCep).not.toHaveBeenCalled();
    const data = prisma.siteOrder.create.mock.calls[0][0].data;
    expect(data.deliveryFee.toString()).toBe('0');
    expect(data.street).toBeUndefined();
    expect(data.total.toString()).toBe('39.8');
  });

  it('refuses orders while the store is switched off in the dashboard', async () => {
    storeSettings.get.mockResolvedValue({ ...settings, storeEnabled: false });

    const error = await service.create(dto(), now).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ reason: 'store_closed' }),
    );
    expect(prisma.siteOrder.create).not.toHaveBeenCalled();
  });

  it('cancels the order and answers 503 when the gateway fails', async () => {
    gateway.createCheckout.mockRejectedValue(new Error('down'));

    await expect(service.create(dto(), now)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o9', status: 'pending_payment' },
      data: { status: 'cancelled' },
    });
  });
});
