import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ALLOWED_IMAGE_MIMETYPES,
  imageFileFilter,
  MAX_IMAGE_BYTES,
  ProductsController,
} from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { ProductsService } from './products.service';

describe('products controllers', () => {
  let admin: ProductsController;
  let pub: PublicProductsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      listActive: jest.fn().mockResolvedValue([]),
      findActiveBySlug: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController, PublicProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    admin = moduleRef.get(ProductsController);
    pub = moduleRef.get(PublicProductsController);
  });

  it('forwards admin calls, with the uploaded photos', () => {
    const files = [{ mimetype: 'image/jpeg', buffer: Buffer.from('a') }];
    const dto = { name: 'Vaso', description: 'd', price: 10, categoryId: 'c1' };

    admin.list({ page: 2 });
    admin.findOne('p1');
    admin.create(dto, files);
    admin.update('p1', { price: 12 }, []);
    admin.remove('p1');

    expect(service.list).toHaveBeenCalledWith({ page: 2 });
    expect(service.findOne).toHaveBeenCalledWith('p1');
    expect(service.create).toHaveBeenCalledWith(dto, files);
    expect(service.update).toHaveBeenCalledWith('p1', { price: 12 }, []);
    expect(service.remove).toHaveBeenCalledWith('p1');
  });

  describe('photo upload rules', () => {
    it.each(ALLOWED_IMAGE_MIMETYPES)('accepts %s', (mimetype) => {
      const cb = jest.fn();
      imageFileFilter({}, { mimetype }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it.each(['image/gif', 'application/pdf', 'image/svg+xml'])(
      'rejects %s with a 400 before anything is uploaded',
      (mimetype) => {
        const cb = jest.fn();
        imageFileFilter({}, { mimetype }, cb);
        const [error, accept] = cb.mock.calls[0];
        expect(error).toBeInstanceOf(BadRequestException);
        expect(accept).toBe(false);
      },
    );

    it('caps each photo at 5 MB', () => {
      expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    });
  });

  describe('public', () => {
    it('GET /products/active returns [] with an empty catalog, filtering by category when asked', async () => {
      await expect(pub.listActive({})).resolves.toEqual([]);
      await pub.listActive({ category: 'vasos' });
      expect(service.listActive).toHaveBeenLastCalledWith('vasos', undefined);
      await pub.listActive({ featured: true });
      expect(service.listActive).toHaveBeenLastCalledWith(undefined, true);
    });

    it('GET /products/active/:slug repassa o 404 do service', async () => {
      service.findActiveBySlug.mockRejectedValue(new NotFoundException());

      await expect(pub.findBySlug('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(service.findActiveBySlug).toHaveBeenCalledWith('nope');
    });

    it('has no auth guard', () => {
      expect(
        Reflect.getMetadata('__guards__', PublicProductsController) ?? [],
      ).toHaveLength(0);
    });
  });
});
