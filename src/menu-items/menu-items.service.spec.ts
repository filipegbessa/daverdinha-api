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

  it('list() includes answerOptions ordered ascending', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      orderBy: { order: 'asc' },
      include: { answerOptions: { orderBy: { order: 'asc' } } },
    });
  });

  it('findOne() returns a single item with its answer options', async () => {
    const item = { id: '1', topic: 'Locais de entrega', answerOptions: [] };
    prisma.menuItem.findUnique.mockResolvedValue(item);

    const result = await service.findOne('1');

    expect(prisma.menuItem.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      include: { answerOptions: { orderBy: { order: 'asc' } } },
    });
    expect(result).toBe(item);
  });

  it('create() persists a new item', async () => {
    const dto = {
      topic: 'Bingo de Plantas',
      type: 'texto' as const,
      reply: 'Todo sábado às 16h!',
      order: 1,
    };
    prisma.menuItem.create.mockResolvedValue({ id: '1', ...dto, active: true, answerOptions: [] });
    const result = await service.create(dto);
    expect(prisma.menuItem.create).toHaveBeenCalledWith({ data: dto, include: { answerOptions: true } });
    expect(result.topic).toBe('Bingo de Plantas');
  });

  it('create() with answerOptions nests them as a single create call, deriving order from array position', async () => {
    const dto = {
      topic: 'Locais de entrega',
      type: 'pergunta' as const,
      order: 0,
      question: 'Qual seu bairro?',
      noMatchReply: 'Não entendi, vou te chamar um atendente!',
      answerOptions: [
        { keywords: ['catete', 'flamengo'], reply: 'Entregamos aí!' },
        { keywords: ['niteroi'], reply: 'Ainda não entregamos aí.' },
      ],
    };
    prisma.menuItem.create.mockResolvedValue({ id: '1', ...dto });

    await service.create(dto);

    expect(prisma.menuItem.create).toHaveBeenCalledWith({
      data: {
        topic: 'Locais de entrega',
        type: 'pergunta',
        order: 0,
        question: 'Qual seu bairro?',
        noMatchReply: 'Não entendi, vou te chamar um atendente!',
        answerOptions: {
          create: [
            { keywords: ['catete', 'flamengo'], reply: 'Entregamos aí!', order: 0 },
            { keywords: ['niteroi'], reply: 'Ainda não entregamos aí.', order: 1 },
          ],
        },
      },
      include: { answerOptions: true },
    });
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

  it('update() with answerOptions replaces the full existing set', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: '1' });

    await service.update('1', {
      answerOptions: [{ keywords: ['ipanema'], reply: 'Entregamos!' }],
    });

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        answerOptions: {
          deleteMany: {},
          create: [{ keywords: ['ipanema'], reply: 'Entregamos!', order: 0 }],
        },
      },
      include: { answerOptions: true },
    });
  });

  it('update() without answerOptions leaves existing answer options untouched', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: '1', active: true });

    await service.update('1', { active: true });

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { active: true },
      include: { answerOptions: true },
    });
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

  it('update() throws ForbiddenException and does not update when changing type on a system item', async () => {
    prisma.menuItem.findUniqueOrThrow.mockResolvedValue({ id: '1', isSystem: true, type: 'entrega' });

    await expect(service.update('1', { type: 'texto' } as any)).rejects.toThrow(ForbiddenException);
    expect(prisma.menuItem.update).not.toHaveBeenCalled();
  });

  it('update() allows changing type on a non-system item', async () => {
    prisma.menuItem.findUniqueOrThrow.mockResolvedValue({ id: '1', isSystem: false, type: 'texto' });
    prisma.menuItem.update.mockResolvedValue({ id: '1', type: 'atendente' });

    await service.update('1', { type: 'atendente' } as any);

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { type: 'atendente' },
      include: { answerOptions: true },
    });
  });

  it('update() without a type field never checks isSystem', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: '1', active: true });

    await service.update('1', { active: true });

    expect(prisma.menuItem.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('findSystemDeliveryItem() queries for the system entrega item', async () => {
    const item = { id: 'sys1', isSystem: true, type: 'entrega' };
    prisma.menuItem.findFirstOrThrow.mockResolvedValue(item);

    const result = await service.findSystemDeliveryItem();

    expect(prisma.menuItem.findFirstOrThrow).toHaveBeenCalledWith({
      where: { isSystem: true, type: 'entrega' },
    });
    expect(result).toBe(item);
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
