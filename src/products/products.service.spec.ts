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
  let prisma: { product: Record<string, jest.Mock> };
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

  it('remove() deletes the stored photos and the row', async () => {
    prisma.product.findUnique.mockResolvedValue(
      row({ images: ['https://blob/a', 'https://blob/b'] }),
    );

    await service.remove('p1');

    expect(blob.deleteImage).toHaveBeenCalledTimes(2);
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  describe('listActive', () => {
    it('returns [] when there are no active products', async () => {
      await expect(service.listActive()).resolves.toEqual([]);
    });

    it('only returns active products of active categories, ordered by order', async () => {
      await service.listActive();

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, category: { active: true } },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        }),
      );
    });

    it('filters by category slug when given', async () => {
      await service.listActive('vasos');

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, category: { active: true, slug: 'vasos' } },
        }),
      );
    });

    it('keeps only featured products when asked, for the home showcase', async () => {
      await service.listActive(undefined, true);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, featured: true, category: { active: true } },
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
      });
    });
  });

  describe('findActiveBySlug', () => {
    it('only finds an active product of an active category', async () => {
      await expect(service.findActiveBySlug('x')).resolves.toBeNull();

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'x', active: true, category: { active: true } },
        }),
      );
    });
  });
});
