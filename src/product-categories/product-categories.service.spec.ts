import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { PrismaService } from '../prisma/prisma.service';

function prismaError(code: string, target?: string[]) {
  return Object.assign(new Error(code), { code, meta: { target } });
}

describe('ProductCategoriesService', () => {
  let service: ProductCategoriesService;
  let prisma: {
    productCategory: Record<string, jest.Mock>;
    product: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      productCategory: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      product: { count: jest.fn().mockResolvedValue(1) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductCategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ProductCategoriesService);
  });

  it('lists ordered by order then name, counting only products not removed', async () => {
    await service.list();
    expect(prisma.productCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { products: { where: { archivedAt: null } } } },
        },
      }),
    );
  });

  describe('create', () => {
    it('generates the slug from the name', async () => {
      prisma.productCategory.create.mockImplementation(({ data }) => data);

      const result = await service.create({ name: 'Vasos e Cachepôs' });

      expect(result.slug).toBe('vasos-e-cachepos');
    });

    it('appends -2 when another category already has the slug', async () => {
      prisma.productCategory.findUnique.mockImplementation(({ where }) =>
        where.slug === 'vasos' ? { id: 'other' } : null,
      );
      prisma.productCategory.create.mockImplementation(({ data }) => data);

      const result = await service.create({ name: 'Vasos!' });

      expect(result.slug).toBe('vasos-2');
    });

    it('rejects a duplicate name with ConflictException', async () => {
      prisma.productCategory.create.mockRejectedValue(
        prismaError('P2002', ['name']),
      );

      await expect(service.create({ name: 'Vasos' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('retries once when a concurrent create took the same slug', async () => {
      prisma.productCategory.create
        .mockRejectedValueOnce(prismaError('P2002', ['slug']))
        .mockImplementation(({ data }) => data);

      const result = await service.create({ name: 'Vasos' });

      expect(prisma.productCategory.create).toHaveBeenCalledTimes(2);
      expect(result.name).toBe('Vasos');
    });
  });

  it('never touches the slug when the name is updated', async () => {
    await service.update('c1', { name: 'Vasos grandes' });

    expect(prisma.productCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Vasos grandes' } }),
    );
  });

  it('blocks deleting a category that still has products, with ConflictException', async () => {
    prisma.productCategory.delete.mockRejectedValue(prismaError('P2003'));

    await expect(service.remove('c1')).rejects.toThrow(
      'Não é possível excluir uma categoria com produtos cadastrados.',
    );
  });

  it('explains the block when only removed products are left in the category', async () => {
    prisma.productCategory.delete.mockRejectedValue(prismaError('P2003'));
    prisma.product.count.mockResolvedValue(0);

    await expect(service.remove('c1')).rejects.toThrow(/produtos removidos/);
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: { categoryId: 'c1', archivedAt: null },
    });
  });

  describe('listActive', () => {
    it('returns [] when there are no categories', async () => {
      await expect(service.listActive()).resolves.toEqual([]);
    });

    it('only returns active categories that have an active product, exposing public fields only', async () => {
      await service.listActive();

      expect(prisma.productCategory.findMany).toHaveBeenCalledWith({
        where: { active: true, products: { some: { active: true } } },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, description: true },
      });
    });
  });
});
