import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BotSettingsService } from './bot-settings.service';
import { PrismaService } from '../prisma/prisma.service';

const ROW = {
  id: 1,
  botEnabled: false,
  welcomeMessage: 'Oi!',
  invalidAttemptsExceededMessage: 'a',
  mediaReceivedMessage: 'b',
  orderReceivedMessage: 'c',
  mediaBytesUsed: 123n,
  updatedAt: new Date('2026-11-10'),
};

describe('BotSettingsService', () => {
  let service: BotSettingsService;
  let prisma: { botSettings: any; menuItem: any };

  beforeEach(async () => {
    prisma = {
      botSettings: {
        upsert: jest.fn().mockResolvedValue(ROW),
        update: jest.fn(),
      },
      menuItem: { count: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BotSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(BotSettingsService);
  });

  it('get() devolve a linha crua, com mediaBytesUsed em bigint', async () => {
    await expect(service.get()).resolves.toEqual(ROW);
  });

  it('get() cria a linha 1 com os padrões se ela não existir, sem sobrescrever a que existe', async () => {
    await service.get();

    expect(prisma.botSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {},
      create: { id: 1, welcomeMessage: expect.any(String) },
    });
  });

  it('getView() converte mediaBytesUsed de bigint pra number e mantém o resto', async () => {
    const result = await service.getView();

    expect(result).toEqual({ ...ROW, mediaBytesUsed: 123 });
    expect(typeof result.mediaBytesUsed).toBe('number');
  });

  it('update() rejects enabling the bot when there are zero active menu items', async () => {
    prisma.menuItem.count.mockResolvedValue(0);
    await expect(service.update({ botEnabled: true })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.botSettings.update).not.toHaveBeenCalled();
  });

  it('update() allows enabling the bot when at least one menu item is active', async () => {
    prisma.menuItem.count.mockResolvedValue(2);
    prisma.botSettings.update.mockResolvedValue({ ...ROW, botEnabled: true });
    const result = await service.update({ botEnabled: true });
    expect(result.botEnabled).toBe(true);
    expect(prisma.botSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { botEnabled: true },
    });
  });

  it('update() allows non-enable updates without checking menu items', async () => {
    prisma.botSettings.update.mockResolvedValue({ ...ROW, mediaBytesUsed: 0n });
    const result = await service.update({ welcomeMessage: 'Oi!' });
    expect(result.welcomeMessage).toBe('Oi!');
    expect(result.mediaBytesUsed).toBe(0);
    expect(prisma.menuItem.count).not.toHaveBeenCalled();
  });

  it('autoDisableIfNoActiveMenuItems() sets botEnabled to false when zero items are active', async () => {
    prisma.menuItem.count.mockResolvedValue(0);
    await service.autoDisableIfNoActiveMenuItems();
    expect(prisma.botSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { botEnabled: false },
    });
  });

  it('autoDisableIfNoActiveMenuItems() does nothing when active items remain', async () => {
    prisma.menuItem.count.mockResolvedValue(1);
    await service.autoDisableIfNoActiveMenuItems();
    expect(prisma.botSettings.update).not.toHaveBeenCalled();
  });
});
