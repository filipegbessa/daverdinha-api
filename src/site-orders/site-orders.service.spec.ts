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
import { EmailService } from '../email/email.service';

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

/** E-mail desligado por padrão (sem chave); os testes de confirmação trocam. */
function emailMock() {
  return { configured: false, send: jest.fn().mockResolvedValue(false) };
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
        { provide: EmailService, useValue: emailMock() },
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
      eventId: null,
      event: null,
      tickets: [],
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
        { provide: EmailService, useValue: emailMock() },
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

    it('shows the event and the attendees of a ticket order, without delivery', async () => {
      prisma.siteOrder.findUnique.mockResolvedValue(
        order({
          kind: 'tickets',
          deliveryMethod: null,
          bairro: null,
          items: [],
          eventId: 'e1',
          event: {
            id: 'e1',
            title: 'Oficina de terrário',
            slug: 'oficina-de-terrario',
            startsAt: new Date('2026-11-21T13:00:00Z'),
            endsAt: new Date('2026-11-21T15:00:00Z'),
            locationName: null,
            locationAddress: null,
          },
          tickets: [
            {
              id: 't1',
              attendeeName: 'Maria',
              unitPrice: new Prisma.Decimal('45.00'),
              code: 'K7Q2-M9XP',
              checkedInAt: null,
            },
          ],
        }),
      );

      const result = await service.findPublicByToken('tok');

      expect(result.event).toEqual({
        title: 'Oficina de terrário',
        slug: 'oficina-de-terrario',
        startsAt: '2026-11-21T13:00:00.000Z',
        endsAt: '2026-11-21T15:00:00.000Z',
        locationName: null,
        locationAddress: null,
      });
      expect(result.tickets).toEqual([
        {
          attendeeName: 'Maria',
          unitPrice: 45,
          code: 'K7Q2-M9XP',
          checkedIn: false,
        },
      ]);
      expect(result.items).toEqual([]);
      expect(result.pickup).toBeNull();
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
          tickets: [],
          event: null,
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
        { provide: EmailService, useValue: emailMock() },
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

describe('SiteOrdersService tickets', () => {
  let service: SiteOrdersService;
  let prisma: {
    event: { findUnique: jest.Mock };
    siteOrderTicket: Record<string, jest.Mock>;
    siteOrder: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let storeSettings: { get: jest.Mock };
  let gateway: { createCheckout: jest.Mock };
  let push: { notifyNewOrder: jest.Mock };
  const now = new Date('2026-11-12T12:00:00Z');
  const startsAt = new Date('2026-11-21T13:00:00Z');

  function event(overrides: Record<string, unknown> = {}) {
    return {
      id: '0b9f7c1e-0000-4000-8000-000000000001',
      title: 'Oficina de terrário',
      slug: 'oficina-de-terrario',
      startsAt,
      endsAt: new Date('2026-11-21T15:00:00Z'),
      locationName: null,
      locationAddress: null,
      price: new Prisma.Decimal('45.00') as Prisma.Decimal | null,
      spots: 12 as number | null,
      published: true,
      ticketSales: true,
      maxTicketsPerOrder: 4,
      ...overrides,
    };
  }

  const dto = (names = ['Maria', 'João']) => ({
    eventId: event().id,
    attendees: names.map((name) => ({ name })),
    customer: {
      name: 'Maria Souza',
      email: 'maria@exemplo.com',
      phone: '(21) 99999-8888',
    },
  });

  /** Pagos e pendentes válidos que o `groupBy` devolve pro evento. */
  function taken(sold: number, reserved: number) {
    prisma.siteOrderTicket.groupBy
      .mockResolvedValueOnce([{ eventId: event().id, _count: { _all: sold } }])
      .mockResolvedValueOnce([
        { eventId: event().id, _count: { _all: reserved } },
      ]);
  }

  beforeEach(async () => {
    process.env.SITE_URL = 'https://www.daverdinha.com.br';
    prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event()) },
      siteOrderTicket: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      siteOrder: {
        create: jest.fn(({ data }) => ({
          id: 'o9',
          number: 43,
          publicToken: 'tok9',
          status: 'pending_payment',
          items: [],
          ...data,
          event: event(),
          tickets: data.tickets.create.map((t: object, i: number) => ({
            id: `t${i}`,
            ...t,
          })),
        })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    storeSettings = {
      get: jest.fn().mockResolvedValue({ ...settings, ticketsEnabled: true }),
    };
    gateway = {
      createCheckout: jest.fn().mockResolvedValue({
        gatewayLinkId: 'pl_9',
        paymentUrl: 'https://checkout.pagar.me/pl_9',
      }),
    };
    push = { notifyNewOrder: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SiteOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveryLocationsService, useValue: {} },
        { provide: DeliveryAreasService, useValue: {} },
        { provide: StoreSettingsService, useValue: storeSettings },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: PushNotificationsService, useValue: push },
        { provide: EmailService, useValue: emailMock() },
      ],
    }).compile();
    service = moduleRef.get(SiteOrdersService);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
  });

  describe('createTickets', () => {
    it('sells paid tickets: one per name, price from the database, reservation capped by the start', async () => {
      const result = await service.createTickets(
        dto(),
        new Date('2026-11-21T12:30:00Z'),
      );

      expect(prisma.$queryRaw).toHaveBeenCalled(); // lockEvent
      const { data } = prisma.siteOrder.create.mock.calls[0][0];
      expect(data).toMatchObject({
        kind: 'tickets',
        eventId: event().id,
        deliveryMethod: null,
        customerPhone: '5521999998888',
      });
      expect(data.total.toString()).toBe('90');
      expect(data.expiresAt).toEqual(startsAt);
      expect(
        data.tickets.create.map(
          (t: { attendeeName: string }) => t.attendeeName,
        ),
      ).toEqual(['Maria', 'João']);
      expect(data.tickets.create[0].unitPrice.toString()).toBe('45');
      const input = gateway.createCheckout.mock.calls[0][0];
      expect(input.items).toEqual([
        expect.objectContaining({
          description: 'Ingresso — Oficina de terrário',
          quantity: 2,
        }),
      ]);
      expect(input.deliveryFee.toString()).toBe('0');
      expect(result).toEqual({
        code: 'DV-0043',
        token: 'tok9',
        paymentUrl: 'https://checkout.pagar.me/pl_9',
      });
      expect(push.notifyNewOrder).not.toHaveBeenCalled();
    });

    it('confirms a free sign-up right away, without the gateway, and pushes once', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ price: null }));

      const result = await service.createTickets(dto(['Maria']), now);

      const { data } = prisma.siteOrder.create.mock.calls[0][0];
      expect(data.status).toBe('paid');
      expect(data.total.toString()).toBe('0');
      expect(gateway.createCheckout).not.toHaveBeenCalled();
      expect(result.paymentUrl).toBeNull();
      expect(push.notifyNewOrder).toHaveBeenCalledTimes(1);
      expect(push.notifyNewOrder.mock.calls[0][0].tickets).toEqual({
        count: 1,
        eventTitle: 'Oficina de terrário',
      });
    });

    it('refuses everything while the Dashboard switch is off', async () => {
      storeSettings.get.mockResolvedValue({
        ...settings,
        ticketsEnabled: false,
      });

      await expect(service.createTickets(dto(), now)).rejects.toMatchObject({
        response: { reason: 'tickets_closed' },
      });
      expect(prisma.siteOrder.create).not.toHaveBeenCalled();
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it.each([
      ['a draft', { published: false }],
      ['an event without sales', { ticketSales: false }],
      ['an event that already started', { startsAt: now }],
    ])('says not_available for %s', async (_label, overrides) => {
      prisma.event.findUnique.mockResolvedValue(event(overrides));

      await expect(service.createTickets(dto(), now)).rejects.toMatchObject({
        response: { reason: 'not_available' },
      });
    });

    it('enforces the per-order limit of the event', async () => {
      await expect(
        service.createTickets(dto(['A1', 'B2', 'C3', 'D4', 'E5']), now),
      ).rejects.toMatchObject({ response: { reason: 'too_many', max: 4 } });
    });

    it('says how many spots are left when there are not enough', async () => {
      taken(10, 1);

      await expect(service.createTickets(dto(), now)).rejects.toMatchObject({
        response: { reason: 'sold_out', spotsLeft: 1 },
      });
    });

    it('never sells out an event without a limit', async () => {
      prisma.event.findUnique.mockResolvedValue(event({ spots: null }));
      taken(500, 0);

      await expect(service.createTickets(dto(), now)).resolves.toBeDefined();
    });

    it('cancels the order and answers 503 when the payment cannot start', async () => {
      gateway.createCheckout.mockRejectedValue(new Error('down'));

      await expect(service.createTickets(dto(), now)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o9', status: 'pending_payment' },
        data: { status: 'cancelled' },
      });
    });
  });

  describe('attendees', () => {
    const ticket = (overrides: Record<string, unknown> = {}) => ({
      id: 't1',
      attendeeName: 'Maria',
      checkedInAt: null,
      order: {
        id: 'o9',
        number: 43,
        status: 'paid',
        customerName: 'Maria Souza',
        customerPhone: '5521999998888',
      },
      ...overrides,
    });

    it('lists paid tickets by name, searchable by attendee or buyer, with sold and spots', async () => {
      prisma.siteOrderTicket.findMany.mockResolvedValue([ticket()]);
      prisma.siteOrderTicket.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(7);

      const page = await service.listAttendees(event().id, { q: 'mar' });

      const { where, orderBy } =
        prisma.siteOrderTicket.findMany.mock.calls[0][0];
      expect(where.order).toEqual({ status: 'paid' });
      expect(where.OR).toHaveLength(2);
      expect(orderBy[0]).toEqual({ attendeeName: 'asc' });
      expect(page).toMatchObject({ total: 1, sold: 7, spots: 12 });
      expect(page.items[0]).toEqual({
        id: 't1',
        attendeeName: 'Maria',
        checkedInAt: null,
        order: {
          id: 'o9',
          code: 'DV-0043',
          customerName: 'Maria Souza',
          customerPhone: '5521999998888',
        },
      });
    });

    it('is a 404 for an unknown event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.listAttendees('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('checks in and out', async () => {
      prisma.siteOrderTicket.findUnique.mockResolvedValue(ticket());
      prisma.siteOrderTicket.update.mockImplementation(({ data }) =>
        ticket(data),
      );

      const checked = await service.setCheckIn('t1', true, now);
      expect(checked.checkedInAt).toBe(now.toISOString());
      await service.setCheckIn('t1', false, now);
      expect(prisma.siteOrderTicket.update.mock.calls[1][0].data).toEqual({
        checkedInAt: null,
      });
    });

    it('refuses to check in a ticket that is not paid', async () => {
      prisma.siteOrderTicket.findUnique.mockResolvedValue(
        ticket({ order: { ...ticket().order, status: 'pending_payment' } }),
      );

      await expect(service.setCheckIn('t1', true)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

describe('SiteOrdersService post-sale', () => {
  let service: SiteOrdersService;
  let prisma: {
    siteOrder: Record<string, jest.Mock>;
    siteOrderTicket: Record<string, jest.Mock>;
    lookupAttempt: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let email: { configured: boolean; send: jest.Mock };
  const eventId = '0b9f7c1e-0000-4000-8000-000000000001';

  const paidTicketOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'o9',
    number: 43,
    publicToken: 'tok9',
    kind: 'tickets',
    status: 'paid',
    customerName: 'Maria Souza',
    customerEmail: 'maria@exemplo.com',
    customerPhone: '5521999998888',
    deliveryMethod: null,
    bairro: null,
    subtotal: new Prisma.Decimal('90'),
    deliveryFee: new Prisma.Decimal('0'),
    total: new Prisma.Decimal('90'),
    items: [],
    eventId,
    event: {
      id: eventId,
      title: 'Oficina de terrário',
      slug: 'oficina-de-terrario',
      startsAt: new Date('2026-11-21T13:00:00Z'),
      endsAt: null,
      locationName: null,
      locationAddress: null,
    },
    tickets: [
      {
        id: 't1',
        attendeeName: 'Maria Souza',
        unitPrice: new Prisma.Decimal('45'),
        code: 'K7Q2-M9XP',
        checkedInAt: null,
      },
      {
        id: 't2',
        attendeeName: 'Bruno Lima',
        unitPrice: new Prisma.Decimal('45'),
        code: 'A2B3-C4D5',
        checkedInAt: null,
      },
    ],
    confirmationSentAt: null,
    fulfillmentStatus: 'awaiting',
    notes: null,
    paidAt: new Date(),
    expiresAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  });

  const ticket = (overrides: Record<string, unknown> = {}) => ({
    id: 't1',
    eventId,
    attendeeName: 'Maria Souza',
    checkedInAt: null,
    code: 'K7Q2-M9XP',
    order: {
      id: 'o9',
      number: 43,
      status: 'paid',
      customerName: 'Maria Souza',
      customerPhone: '5521999998888',
    },
    ...overrides,
  });

  beforeEach(async () => {
    process.env.SITE_URL = 'https://www.daverdinha.com.br';
    prisma = {
      siteOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(paidTicketOrder()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      siteOrderTicket: {
        findUnique: jest.fn().mockResolvedValue(ticket()),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lookupAttempt: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops) : undefined,
      ),
    };
    email = { configured: true, send: jest.fn().mockResolvedValue(true) };
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
        { provide: PAYMENT_GATEWAY, useValue: {} },
        { provide: PushNotificationsService, useValue: {} },
        { provide: EmailService, useValue: email },
      ],
    }).compile();
    service = moduleRef.get(SiteOrdersService);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  });

  describe('confirmation email', () => {
    const send = () => service['sendConfirmation']('o9');

    it('claims the order before sending, so a repeated webhook sends one email', async () => {
      expect(await send()).toBe(true);
      expect(prisma.siteOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o9', status: 'paid', confirmationSentAt: null },
        data: { confirmationSentAt: expect.any(Date) },
      });
      const sent = email.send.mock.calls[0][0];
      expect(sent.to).toBe('maria@exemplo.com');
      expect(sent.subject).toContain('Ingresso confirmado!');
      expect(sent.images).toHaveLength(2);

      prisma.siteOrder.updateMany.mockResolvedValue({ count: 0 });
      expect(await send()).toBe(false);
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('releases the claim when sending fails or email is off, so it can be resent', async () => {
      email.send.mockRejectedValueOnce(new Error('resend down'));
      expect(await send()).toBe(false);
      email.send.mockResolvedValueOnce(false);
      expect(await send()).toBe(false);

      const releases = prisma.siteOrder.updateMany.mock.calls.filter(
        (c) => c[0].data.confirmationSentAt === null,
      );
      expect(releases).toHaveLength(2);
    });

    it('resends only paid orders, and says when email is not set up', async () => {
      prisma.siteOrder.findUnique.mockResolvedValueOnce(
        paidTicketOrder({ status: 'pending_payment' }),
      );
      await expect(service.resendConfirmation('o9')).rejects.toThrow(
        ConflictException,
      );

      email.configured = false;
      await expect(service.resendConfirmation('o9')).rejects.toThrow(
        ServiceUnavailableException,
      );

      email.configured = true;
      await service.resendConfirmation('o9');
      expect(prisma.siteOrder.updateMany.mock.calls[0][0].where).toEqual({
        id: 'o9',
        status: 'paid',
      });
    });
  });

  describe('checkInByCode', () => {
    it('checks a paid ticket of this event in, once, accepting the code typed in any form', async () => {
      const attendee = await service.checkInByCode(eventId, 'k7q2 m9xp');

      expect(prisma.siteOrderTicket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'K7Q2-M9XP' } }),
      );
      expect(prisma.siteOrderTicket.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', checkedInAt: null },
        data: { checkedInAt: expect.any(Date) },
      });
      expect(attendee.checkedInAt).not.toBeNull();
    });

    it('is a 404 for an unknown code', async () => {
      prisma.siteOrderTicket.findUnique.mockResolvedValue(null);

      await expect(service.checkInByCode(eventId, 'ZZZZ-ZZZZ')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ['other_event', ticket({ eventId: 'outro' })],
      [
        'not_paid',
        ticket({ order: { ...ticket().order, status: 'pending_payment' } }),
      ],
    ])('refuses with %s', async (reason, row) => {
      prisma.siteOrderTicket.findUnique.mockResolvedValue(row);

      await expect(
        service.checkInByCode(eventId, 'K7Q2-M9XP'),
      ).rejects.toMatchObject({ response: { reason } });
    });

    it('says when the ticket already got in', async () => {
      const at = new Date('2026-11-21T22:42:00Z');
      prisma.siteOrderTicket.updateMany.mockResolvedValue({ count: 0 });
      prisma.siteOrderTicket.findUniqueOrThrow.mockResolvedValue({
        checkedInAt: at,
      });

      await expect(
        service.checkInByCode(eventId, 'K7Q2-M9XP'),
      ).rejects.toMatchObject({
        response: {
          reason: 'already_checked_in',
          checkedInAt: at.toISOString(),
        },
      });
    });
  });

  describe('sendOrderLinks', () => {
    it('emails the links of the recent paid or pending orders of that address', async () => {
      prisma.siteOrder.findMany.mockResolvedValue([
        {
          number: 43,
          publicToken: 'tok9',
          kind: 'tickets',
          status: 'paid',
          total: new Prisma.Decimal('90'),
          createdAt: new Date('2026-11-12T12:00:00Z'),
          event: { title: 'Oficina de terrário' },
        },
      ]);

      await service.sendOrderLinks(' Maria@Exemplo.com ', '1.2.3.4');

      const { where } = prisma.siteOrder.findMany.mock.calls[0][0];
      expect(where.customerEmail).toEqual({
        equals: 'maria@exemplo.com',
        mode: 'insensitive',
      });
      const sent = email.send.mock.calls[0][0];
      expect(sent.to).toBe('maria@exemplo.com');
      expect(sent.text).toContain('https://www.daverdinha.com.br/pedido/tok9');
      expect(prisma.lookupAttempt.createMany).toHaveBeenCalledWith({
        data: [{ key: 'email:maria@exemplo.com' }, { key: 'ip:1.2.3.4' }],
      });
    });

    it('sends nothing, and answers the same, when there is no order', async () => {
      await expect(
        service.sendOrderLinks('ninguem@exemplo.com', '1.2.3.4'),
      ).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('stops after too many attempts in an hour', async () => {
      prisma.lookupAttempt.count.mockResolvedValueOnce(3);

      await expect(
        service.sendOrderLinks('maria@exemplo.com', '1.2.3.4'),
      ).rejects.toMatchObject({ status: 429 });
      expect(prisma.siteOrder.findMany).not.toHaveBeenCalled();
    });
  });
});
