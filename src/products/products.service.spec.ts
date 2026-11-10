import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService, type UploadedPhoto } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';

const category = { id: 'c1', name: 'Vasos', slug: 'vasos' };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Vaso Terracota M',
    slug: 'vaso-terracota-m',
    description: 'Terracota de 18 cm.',
    price: new Prisma.Decimal('89.90'),
    images: [] as string[],
    categoryId: 'c1',
    category,
    active: true,
    order: 0,
    stock: null as number | null,
    leadTimeDays: 10 as number | null,
    archivedAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function file(name: string, mimetype = 'image/jpeg'): UploadedPhoto {
  return { mimetype, buffer: Buffer.from(name) };
}

const dto = {
  name: 'Vaso Terracota M',
  description: 'Terracota de 18 cm.',
  price: 89.9,
  categoryId: 'c1',
};

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: Record<string, jest.Mock>;
    siteOrderItem: { groupBy: jest.Mock };
  };
  let blob: { uploadProductImage: jest.Mock; deleteImage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) =>
          row({ ...data, price: new Prisma.Decimal(data.price) }),
        ),
        update: jest.fn(({ data }) => row(data)),
        delete: jest.fn(),
      },
      siteOrderItem: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    blob = {
      uploadProductImage: jest.fn(
        async (buffer: Buffer) => `https://blob/${buffer.toString()}`,
      ),
      deleteImage: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BlobStorageService, useValue: blob },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('create', () => {
    it('generates a slug from the name', async () => {
      const result = await service.create(dto, []);
      expect(result.slug).toBe('vaso-terracota-m');
    });

    it('appends -2 when the base slug is already taken', async () => {
      prisma.product.findUnique.mockImplementation(({ where }) =>
        where.slug === 'vaso-terracota-m' ? row() : null,
      );

      const result = await service.create(dto, []);

      expect(result.slug).toBe('vaso-terracota-m-2');
    });

    it('uploads each photo and stores the URLs in the order received', async () => {
      const result = await service.create(dto, [file('a'), file('b')]);

      expect(result.images).toEqual(['https://blob/a', 'https://blob/b']);
    });

    it('returns price as a number, not a Decimal or string', async () => {
      const result = await service.create(dto, []);

      expect(result.price).toBe(89.9);
      expect(typeof result.price).toBe('number');
    });

    it('rejects an unknown category with 400, and removes the photos it just uploaded', async () => {
      prisma.product.create.mockRejectedValue(
        Object.assign(new Error('fk'), { code: 'P2003' }),
      );

      await expect(service.create(dto, [file('a')])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(blob.deleteImage).toHaveBeenCalledWith('https://blob/a');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue(
        row({ images: ['https://blob/old'] }),
      );
    });

    it('keeps the slug when the name changes', async () => {
      await service.update('p1', { name: 'Vaso Terracota Grande' });

      expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty(
        'slug',
      );
    });

    it('keeps the photos when no new ones are sent', async () => {
      await service.update('p1', { price: 99 });

      expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty(
        'images',
      );
      expect(blob.deleteImage).not.toHaveBeenCalled();
    });

    it('replaces the photos, deleting the old ones only after saving', async () => {
      const result = await service.update('p1', {}, [file('new')]);

      expect(result.images).toEqual(['https://blob/new']);
      expect(blob.deleteImage).toHaveBeenCalledWith('https://blob/old');
      expect(blob.deleteImage.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.product.update.mock.invocationCallOrder[0],
      );
    });

    it('is a 404 for a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('archives the product, keeping the row and photos for old orders', async () => {
      prisma.product.findUnique.mockResolvedValue(
        row({ images: ['https://blob/a'] }),
      );

      await service.remove('p1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { archivedAt: expect.any(Date), active: false, featured: false },
      });
      expect(prisma.product.delete).not.toHaveBeenCalled();
      expect(blob.deleteImage).not.toHaveBeenCalled();
    });

    it('treats a removed product as gone', async () => {
      prisma.product.findUnique.mockResolvedValue(
        row({ archivedAt: new Date() }),
      );

      await expect(service.remove('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.update('p1', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('pages the whole catalog when no filter is given', async () => {
      await service.list({ page: 2, perPage: 10 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { archivedAt: null },
          skip: 10,
          take: 10,
        }),
      );
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { archivedAt: null },
      });
    });

    it('combines name search, category, active and featured, and counts with the same filter', async () => {
      await service.list({
        q: '  vaso ',
        categoryId: 'c1',
        active: false,
        featured: true,
      });

      const where = {
        archivedAt: null,
        name: { contains: 'vaso', mode: 'insensitive' },
        categoryId: 'c1',
        active: false,
        featured: true,
      };
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.product.count).toHaveBeenCalledWith({ where });
    });

    it('ignores a blank search', async () => {
      await service.list({ q: '   ' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { archivedAt: null } }),
      );
    });
  });

  describe('listActive', () => {
    it('returns [] when there are no active products', async () => {
      await expect(service.listActive()).resolves.toEqual([]);
    });

    it('only returns active products of active categories, ordered by order', async () => {
      await service.listActive();

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, archivedAt: null, category: { active: true } },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        }),
      );
    });

    it('filters by category slug when given', async () => {
      await service.listActive('vasos');

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            active: true,
            archivedAt: null,
            category: { active: true, slug: 'vasos' },
          },
        }),
      );
    });

    it('keeps only featured products when asked, for the home showcase', async () => {
      await service.listActive(undefined, true);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            active: true,
            archivedAt: null,
            featured: true,
            category: { active: true },
          },
        }),
      );
    });

    it('exposes exactly the public contract, with the category slug', async () => {
      prisma.product.findMany.mockResolvedValue([row()]);

      const [product] = await service.listActive();

      expect(product).toEqual({
        id: 'p1',
        name: 'Vaso Terracota M',
        slug: 'vaso-terracota-m',
        description: 'Terracota de 18 cm.',
        price: 89.9,
        images: [],
        category: { id: 'c1', name: 'Vasos', slug: 'vasos' },
        availability: 'made_to_order',
        leadTimeDays: 10,
      });
    });

    it('discounts pending reservations and hides the lead time of in-stock products', async () => {
      prisma.product.findMany.mockResolvedValue([
        row({ id: 'p1', stock: 3, leadTimeDays: 10 }),
        row({ id: 'p2', stock: 1 }),
        row({ id: 'p3', stock: null, leadTimeDays: 7 }),
      ]);
      prisma.siteOrderItem.groupBy.mockResolvedValue([
        { productId: 'p2', _sum: { quantity: 1 } },
      ]);

      const products = await service.listActive();

      expect(
        products.map((p) => [p.id, p.availability, p.leadTimeDays]),
      ).toEqual([
        ['p1', 'in_stock', null],
        ['p2', 'sold_out', null],
        ['p3', 'made_to_order', 7],
      ]);
      // Uma consulta pra lista toda, só com os produtos que têm estoque.
      expect(prisma.siteOrderItem.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.siteOrderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId: { in: ['p1', 'p2'] },
          }),
        }),
      );
    });

    it('keeps sold-out products listed', async () => {
      prisma.product.findMany.mockResolvedValue([row({ stock: 0 })]);

      const [product] = await service.listActive();

      expect(product.availability).toBe('sold_out');
    });
  });

  describe('stock and lead time', () => {
    it('creates a made-to-order product with its lead time', async () => {
      const result = await service.create(
        { ...dto, stock: null, leadTimeDays: 10 },
        [],
      );

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stock: null, leadTimeDays: 10 }),
        }),
      );
      expect(result.availability).toBe('made_to_order');
    });

    it('refuses a made-to-order product without a lead time', async () => {
      await expect(
        service.create({ ...dto, stock: null, leadTimeDays: null }, []),
      ).rejects.toThrow(
        new BadRequestException('Informe o prazo de confecção.'),
      );
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('checks a partial update against the saved lead time', async () => {
      prisma.product.findUnique.mockResolvedValue(
        row({ stock: 5, leadTimeDays: null }),
      );
      await expect(service.update('p1', { stock: null })).rejects.toThrow(
        BadRequestException,
      );

      prisma.product.findUnique.mockResolvedValue(
        row({ stock: 5, leadTimeDays: 7 }),
      );
      await expect(service.update('p1', { stock: null })).resolves.toEqual(
        expect.objectContaining({ stock: null }),
      );
    });

    it('does not check when the request does not touch stock, so older products still save', async () => {
      prisma.product.findUnique.mockResolvedValue(
        row({ stock: null, leadTimeDays: null }),
      );

      await expect(service.update('p1', { active: false })).resolves.toEqual(
        expect.objectContaining({ active: false }),
      );
    });

    it('creates without stock fields, as the admin did before this change', async () => {
      await expect(service.create(dto, [])).resolves.toBeDefined();
    });

    it('gives the admin the raw stock and the saved lead time', async () => {
      prisma.product.findUnique.mockResolvedValue(
        row({ stock: 2, leadTimeDays: 7 }),
      );

      const product = await service.findOne('p1');

      expect(product).toEqual(
        expect.objectContaining({
          stock: 2,
          leadTimeDays: 7,
          availability: 'in_stock',
        }),
      );
    });
  });

  describe('findActiveBySlug', () => {
    it('only finds an active product of an active category, 404 otherwise', async () => {
      await expect(service.findActiveBySlug('x')).rejects.toThrow(
        'Produto não encontrado.',
      );

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            slug: 'x',
            active: true,
            archivedAt: null,
            category: { active: true },
          },
        }),
      );
    });
  });
});
