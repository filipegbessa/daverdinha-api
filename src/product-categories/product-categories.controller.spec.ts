import { Test } from '@nestjs/testing';
import { ProductCategoriesController } from './product-categories.controller';
import { PublicProductCategoriesController } from './public-product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';

describe('product categories controllers', () => {
  let admin: ProductCategoriesController;
  let pub: PublicProductCategoriesController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      listActive: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        ProductCategoriesController,
        PublicProductCategoriesController,
      ],
      providers: [{ provide: ProductCategoriesService, useValue: service }],
    }).compile();

    admin = moduleRef.get(ProductCategoriesController);
    pub = moduleRef.get(PublicProductCategoriesController);
  });

  it('forwards admin calls to the service', () => {
    admin.list();
    admin.create({ name: 'Vasos' });
    admin.update('c1', { description: 'texto' });
    admin.remove('c1');

    expect(service.list).toHaveBeenCalled();
    expect(service.create).toHaveBeenCalledWith({ name: 'Vasos' });
    expect(service.update).toHaveBeenCalledWith('c1', { description: 'texto' });
    expect(service.remove).toHaveBeenCalledWith('c1');
  });

  it('GET /product-categories/active returns [] with an empty catalog', async () => {
    await expect(pub.listActive()).resolves.toEqual([]);
  });

  it('keeps the public controller free of the Clerk guard', () => {
    const guards =
      Reflect.getMetadata('__guards__', PublicProductCategoriesController) ??
      [];
    expect(guards).toHaveLength(0);
  });
});
