import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { SalesSummaryService, startOfRioDay } from './sales-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoreSettingsService } from '../store-settings/store-settings.service';

const now = new Date('2026-11-17T15:00:00Z'); // 12h no Rio

describe('startOfRioDay', () => {
  it('starts the day at midnight in Rio (03:00 UTC)', () => {
    expect(startOfRioDay(now).toISOString()).toBe('2026-11-17T03:00:00.000Z');
  });

  it('is still yesterday in Rio before 03:00 UTC', () => {
    expect(startOfRioDay(new Date('2026-11-17T02:30:00Z')).toISOString()).toBe(
      '2026-11-16T03:00:00.000Z',
    );
  });
});

describe('SalesSummaryService', () => {
  let service: SalesSummaryService;
  let prisma: {
    siteOrder: { findMany: jest.Mock; count: jest.Mock };
    siteOrderItem: { groupBy: jest.Mock };
    product: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      siteOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            total: new Prisma.Decimal('100.00'),
            paidAt: new Date('2026-11-17T13:00:00Z'),
          },
          {
            total: new Prisma.Decimal('50.50'),
            paidAt: new Date('2026-11-14T13:00:00Z'),
          },
          {
            total: new Prisma.Decimal('49.50'),
            paidAt: new Date('2026-10-25T13:00:00Z'),
          },
        ]),
        count: jest
          .fn()
          .mockResolvedValueOnce(3) // a preparar
          .mockResolvedValueOnce(1), // prontos
      },
      siteOrderItem: {
        groupBy: jest.fn().mockResolvedValue([
          { productName: 'Vaso M', _sum: { quantity: 7 } },
          { productName: 'Muda', _sum: { quantity: null } },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', name: 'Vaso P', stock: 0 },
          { id: 'p2', name: 'Vaso G', stock: 2 },
        ]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesSummaryService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StoreSettingsService,
          useValue: {
            get: jest.fn().mockResolvedValue({ lowStockThreshold: 2 }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(SalesSummaryService);
  });

  it('adds up paid orders by period, by payment date', async () => {
    const summary = await service.summary(now);

    expect(summary.today).toEqual({ orders: 1, revenue: 100 });
    expect(summary.last7Days).toEqual({ orders: 2, revenue: 150.5 });
    expect(summary.last30Days).toEqual({ orders: 3, revenue: 200 });
    expect(summary.averageTicket30Days).toBe(66.67);
  });

  it('counts only paid orders with a value, from 30 days ago in Rio', async () => {
    await service.summary(now);

    expect(prisma.siteOrder.findMany).toHaveBeenCalledWith({
      where: {
        status: 'paid',
        paidAt: { gte: new Date('2026-10-19T03:00:00.000Z') },
        total: { gt: 0 },
      },
      select: { total: true, paidAt: true },
    });
  });

  it('brings what to prepare, the best sellers and the low stock', async () => {
    const summary = await service.summary(now);

    expect(summary.toPrepare).toBe(3);
    expect(summary.readyToDeliver).toBe(1);
    expect(summary.topProducts).toEqual([
      { name: 'Vaso M', quantity: 7 },
      { name: 'Muda', quantity: 0 },
    ]);
    expect(summary.lowStock).toEqual({
      threshold: 2,
      products: [
        { id: 'p1', name: 'Vaso P', stock: 0 },
        { id: 'p2', name: 'Vaso G', stock: 2 },
      ],
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          active: true,
          stock: { not: null, lte: 2 },
        },
      }),
    );
  });

  it('has no average without sales', async () => {
    prisma.siteOrder.findMany.mockResolvedValue([]);
    await expect(service.summary(now)).resolves.toMatchObject({
      averageTicket30Days: null,
      today: { orders: 0, revenue: 0 },
    });
  });
});
