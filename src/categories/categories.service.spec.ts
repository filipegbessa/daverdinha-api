import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: { category: any };

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  it('list() flattens the conversation count out of Prisma\'s _count wrapper', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat1', name: 'Bingo', color: '#185928', createdAt: new Date('2026-01-01'), _count: { conversations: 3 } },
      { id: 'cat2', name: 'Fechou compra', color: '#7a3247', createdAt: new Date('2026-01-02'), _count: { conversations: 0 } },
    ]);

    const result = await service.list();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: { _count: { select: { conversations: true } } },
    });
    expect(result).toEqual([
      { id: 'cat1', name: 'Bingo', color: '#185928', createdAt: new Date('2026-01-01'), conversationCount: 3 },
      { id: 'cat2', name: 'Fechou compra', color: '#7a3247', createdAt: new Date('2026-01-02'), conversationCount: 0 },
    ]);
  });

  it('create() forwards the dto to Prisma', async () => {
    prisma.category.create.mockResolvedValue({ id: 'cat1', name: 'Bingo', color: '#185928' });

    await service.create({ name: 'Bingo', color: '#185928' });

    expect(prisma.category.create).toHaveBeenCalledWith({ data: { name: 'Bingo', color: '#185928' } });
  });

  it('create() raises a friendly ConflictException on a duplicate name instead of the raw Prisma error', async () => {
    prisma.category.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.create({ name: 'Bingo', color: '#185928' })).rejects.toThrow(
      new ConflictException('Já existe uma categoria com esse nome.'),
    );
  });

  it('update() forwards the dto to Prisma', async () => {
    prisma.category.update.mockResolvedValue({ id: 'cat1', name: 'Bingo!', color: '#185928' });

    await service.update('cat1', { name: 'Bingo!' });

    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat1' }, data: { name: 'Bingo!' } });
  });

  it('update() also raises a friendly ConflictException on a duplicate name', async () => {
    prisma.category.update.mockRejectedValue({ code: 'P2002' });

    await expect(service.update('cat1', { name: 'Fechou compra' })).rejects.toThrow(
      new ConflictException('Já existe uma categoria com esse nome.'),
    );
  });

  it('remove() deletes by id, relying on cascade for attached conversations', async () => {
    prisma.category.delete.mockResolvedValue({ id: 'cat1' });

    await service.remove('cat1');

    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'cat1' } });
  });
});
