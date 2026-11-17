import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date('2026-11-20T15:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    code: 'BEMVINDA',
    description: null,
    type: 'percent',
    value: new Prisma.Decimal(10),
    maxDiscount: null,
    scope: 'order',
    minSubtotal: null,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    active: true,
    categories: [],
    products: [],
    events: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const products = {
  kind: 'products' as const,
  lines: [
    {
      productId: 'p1',
      categoryId: 'vasos',
      lineTotal: new Prisma.Decimal(100),
      onPromo: false,
    },
  ],
};

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: {
    coupon: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    siteOrder: { count: jest.Mock; groupBy: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(row()),
        create: jest.fn(({ data }) =>
          row({ ...data, categories: [], products: [], events: [] }),
        ),
        update: jest.fn(),
        delete: jest.fn(),
      },
      siteOrder: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CouponsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CouponsService);
  });

  describe('evaluate', () => {
    it('finds the code however it was typed and applies it', async () => {
      const result = await service.evaluate(
        prisma as never,
        ' bemvinda ',
        products,
        now,
      );

      expect(prisma.coupon.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'BEMVINDA' } }),
      );
      expect(result).toMatchObject({
        ok: true,
        couponId: 'c1',
        code: 'BEMVINDA',
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('says not found for an unknown or inactive coupon', async () => {
      prisma.coupon.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.evaluate(prisma as never, 'NADA', products, now),
      ).resolves.toEqual({
        ok: false,
        error: 'Cupom não encontrado.',
        code: 'NADA',
      });
      prisma.coupon.findUnique.mockResolvedValueOnce(row({ active: false }));
      await expect(
        service.evaluate(prisma as never, 'BEMVINDA', products, now),
      ).resolves.toMatchObject({
        ok: false,
        error: 'Cupom não encontrado.',
      });
    });

    it('counts paid orders and pending ones still in time, locking the coupon when creating an order', async () => {
      prisma.coupon.findUnique.mockResolvedValue(row({ maxUses: 2 }));
      prisma.siteOrder.count.mockResolvedValue(2);

      const result = await service.evaluate(
        prisma as never,
        'BEMVINDA',
        products,
        now,
        { lock: true },
      );

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.siteOrder.count).toHaveBeenCalledWith({
        where: {
          couponId: 'c1',
          OR: [
            { status: 'paid' },
            { status: 'pending_payment', expiresAt: { gt: now } },
          ],
        },
      });
      expect(result).toMatchObject({ ok: false, error: 'Este cupom esgotou.' });
    });
  });

  describe('create', () => {
    const base = {
      code: 'BEMVINDA',
      type: 'percent' as const,
      value: 10,
      scope: 'order' as const,
    };

    it.each([
      [{ value: 0 }, 'Informe a porcentagem, de 1 a 100.'],
      [{ value: 150 }, 'Informe a porcentagem, de 1 a 100.'],
      [{ type: 'fixed' as const, value: null }, 'Informe o valor do desconto.'],
      [
        { type: 'fixed' as const, value: 10, maxDiscount: 5 },
        'O desconto máximo só vale para cupom de porcentagem.',
      ],
      [{ scope: 'categories' as const }, 'Escolha pelo menos uma categoria.'],
      [
        { scope: 'products' as const, productIds: [] },
        'Escolha pelo menos um produto.',
      ],
      [
        {
          scope: 'events' as const,
          type: 'free_shipping' as const,
          value: null,
        },
        'Ingresso não tem frete.',
      ],
      [
        {
          startsAt: '2026-12-10T03:00:00.000Z',
          endsAt: '2026-12-01T03:00:00.000Z',
        },
        'O fim precisa ser depois do início.',
      ],
    ])('refuses %o', async (overrides, message) => {
      await expect(service.create({ ...base, ...overrides })).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(prisma.coupon.create).not.toHaveBeenCalled();
    });

    it('saves the scope lists and the money as Decimal', async () => {
      await service.create({
        ...base,
        scope: 'categories',
        categoryIds: ['cat1', 'cat1'],
        minSubtotal: 100,
        maxDiscount: 50,
      });

      const { data } = prisma.coupon.create.mock.calls[0][0];
      expect(data.categories).toEqual({ create: [{ categoryId: 'cat1' }] });
      expect(data.minSubtotal.toString()).toBe('100');
      expect(data.maxDiscount.toString()).toBe('50');
    });
  });

  describe('remove', () => {
    it('deletes an unused coupon and only deactivates a used one', async () => {
      await expect(service.remove('c1')).resolves.toEqual({ deleted: true });
      expect(prisma.coupon.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });

      prisma.siteOrder.count.mockResolvedValue(3);
      await expect(service.remove('c1')).resolves.toEqual({ deleted: false });
      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { active: false },
      });
    });
  });
});
