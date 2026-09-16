import { Test } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }],
    }).compile();

    controller = moduleRef.get(CategoriesController);
  });

  it('list() forwards the pagination query to the service', () => {
    controller.list({ page: 2, perPage: 10 });
    expect(service.list).toHaveBeenCalledWith({ page: 2, perPage: 10 });
  });

  it('create() forwards the dto', () => {
    const dto = { name: 'Bingo', color: '#185928' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update() forwards the id and dto', () => {
    const dto = { name: 'Bingo!' };
    controller.update('cat1', dto);
    expect(service.update).toHaveBeenCalledWith('cat1', dto);
  });

  it('remove() forwards the id', () => {
    controller.remove('cat1');
    expect(service.remove).toHaveBeenCalledWith('cat1');
  });
});
