import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('CustomersService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    siteOrder: {
      aggregate: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    conversation: { findMany: jest.fn() },
  };
  const service = new CustomersService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  describe('list', () => {
    it('maps the rows and links the conversation with or without the ninth digit', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            name: 'Ana',
            email: 'ana@exemplo.com',
            phone: '5521984448130',
            orders: 2,
            spent: new Prisma.Decimal('150.5'),
            last_order_at: new Date('2026-11-10T12:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([{ count: 1 }]);
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'conv1', phone: '552184448130' },
      ]);

      const result = await service.list({ q: 'ana' });

      expect(result).toEqual({
        items: [
          {
            name: 'Ana',
            email: 'ana@exemplo.com',
            phone: '5521984448130',
            ordersCount: 2,
            totalSpent: 150.5,
            lastOrderAt: '2026-11-10T12:00:00.000Z',
            conversationId: 'conv1',
          },
        ],
        page: 1,
        perPage: 20,
        total: 1,
        totalPages: 1,
      });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phone: { in: ['5521984448130', '552184448130'] } },
        }),
      );
    });

    it('does not look for conversations on an empty page', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      const result = await service.list();

      expect(result.items).toEqual([]);
      expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('byPhone', () => {
    it('sums the paid orders of the phone and lists the recent ones', async () => {
      prisma.siteOrder.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _sum: { total: new Prisma.Decimal('300') },
        _max: { createdAt: new Date('2026-11-12T10:00:00Z') },
      });
      prisma.siteOrder.findFirst.mockResolvedValue({
        customerName: 'Ana Souza',
        customerEmail: 'ana@exemplo.com',
      });
      prisma.siteOrder.findMany.mockResolvedValue([
        {
          id: 'o1',
          number: 42,
          kind: 'products',
          status: 'pending_payment',
          total: new Prisma.Decimal('99'),
          createdAt: new Date('2026-11-13T10:00:00Z'),
        },
      ]);
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'conv1', phone: '5521984448130' },
      ]);

      const result = await service.byPhone('(21) 98444-8130');

      expect(prisma.siteOrder.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerPhone: { in: ['5521984448130', '552184448130'] },
            status: 'paid',
          },
        }),
      );
      expect(result).toEqual({
        customer: {
          name: 'Ana Souza',
          email: 'ana@exemplo.com',
          ordersCount: 3,
          totalSpent: 300,
          lastOrderAt: '2026-11-12T10:00:00.000Z',
        },
        recentOrders: [
          {
            id: 'o1',
            code: 'DV-0042',
            kind: 'products',
            status: 'pending_payment',
            total: 99,
            createdAt: '2026-11-13T10:00:00.000Z',
          },
        ],
        conversationId: 'conv1',
      });
    });

    it('has no customer when the phone never paid an order', async () => {
      prisma.siteOrder.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { total: null },
        _max: { createdAt: null },
      });
      prisma.siteOrder.findFirst.mockResolvedValue(null);
      prisma.siteOrder.findMany.mockResolvedValue([]);
      prisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.byPhone('5521984448130');

      expect(result).toEqual({
        customer: null,
        recentOrders: [],
        conversationId: null,
      });
    });

    it('answers empty for something that is not a phone', async () => {
      const result = await service.byPhone('abc');

      expect(result.customer).toBeNull();
      expect(prisma.siteOrder.aggregate).not.toHaveBeenCalled();
    });
  });
});
