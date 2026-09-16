import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';
import { PrismaService } from '../prisma/prisma.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';

describe('MenuItemsService', () => {
  let service: MenuItemsService;
  let prisma: { menuItem: any; $transaction: jest.Mock };
  let botSettings: { autoDisableIfNoActiveMenuItems: jest.Mock };

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirstOrThrow: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    botSettings = { autoDisableIfNoActiveMenuItems: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MenuItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BotSettingsService, useValue: botSettings },
      ],
    }).compile();

    service = moduleRef.get(MenuItemsService);
  });

  it('list() returns every item in menu order', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({ orderBy: { order: 'asc' } });
  });

  it('listActive() returns only active items, in menu order', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    await service.listActive();
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
  });

  it('findOne() returns a single item', async () => {
    const item = { id: '1', topic: 'Locais de entrega' };
    prisma.menuItem.findUnique.mockResolvedValue(item);

    const result = await service.findOne('1');

    expect(prisma.menuItem.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
    expect(result).toBe(item);
  });

  it('create() persists a new item', async () => {
    const dto = { topic: 'Bingo de Plantas', reply: 'Todo sábado às 16h!', order: 1 };
    prisma.menuItem.create.mockResolvedValue({ id: '1', ...dto, active: true });
    const result = await service.create(dto);
    expect(prisma.menuItem.create).toHaveBeenCalledWith({ data: dto });
    expect(result.topic).toBe('Bingo de Plantas');
  });

  it('update() deactivating an item triggers auto-disable check', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: '1', active: false });
    await service.update('1', { active: false });
    expect(botSettings.autoDisableIfNoActiveMenuItems).toHaveBeenCalled();
  });

  it('update() activating an item does not trigger auto-disable check', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: '1', active: true });
    await service.update('1', { active: true });
    expect(botSettings.autoDisableIfNoActiveMenuItems).not.toHaveBeenCalled();
  });

  it('remove() throws ForbiddenException and does not delete when the item is a system item', async () => {
    prisma.menuItem.findUniqueOrThrow.mockResolvedValue({ id: '1', isSystem: true });

    await expect(service.remove('1')).rejects.toThrow(ForbiddenException);
    expect(prisma.menuItem.delete).not.toHaveBeenCalled();
    expect(botSettings.autoDisableIfNoActiveMenuItems).not.toHaveBeenCalled();
  });

  it('remove() deletes the item and triggers auto-disable check', async () => {
    prisma.menuItem.findUniqueOrThrow.mockResolvedValue({ id: '1', isSystem: false });
    prisma.menuItem.delete.mockResolvedValue({ id: '1' });

    await service.remove('1');

    expect(prisma.menuItem.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    expect(botSettings.autoDisableIfNoActiveMenuItems).toHaveBeenCalled();
  });

  it('findSystemDeliveryItem() queries for the one system item', async () => {
    const item = { id: 'sys1', isSystem: true };
    prisma.menuItem.findFirstOrThrow.mockResolvedValue(item);

    const result = await service.findSystemDeliveryItem();

    expect(prisma.menuItem.findFirstOrThrow).toHaveBeenCalledWith({ where: { isSystem: true } });
    expect(result).toBe(item);
  });

  it('update() no longer round-trips to the DB before writing', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: '1', active: true });

    await service.update('1', { active: true });

    expect(prisma.menuItem.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { active: true },
    });
  });

  it('reorder() calls update with the right order for each id, in a transaction', async () => {
    const updateCalls: any[] = [];
    prisma.menuItem.update.mockImplementation((args: any) => {
      updateCalls.push(args);
      return args;
    });
    prisma.$transaction.mockImplementation((ops: any[]) =>
      Promise.resolve(ops),
    );

    await service.reorder({ orderedIds: ['b', 'a'] });

    expect(updateCalls).toEqual([
      { where: { id: 'b' }, data: { order: 0 } },
      { where: { id: 'a' }, data: { order: 1 } },
    ]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
