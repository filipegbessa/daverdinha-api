import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BotSettingsService } from './bot-settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BotSettingsService', () => {
  let service: BotSettingsService;
  let prisma: { botSettings: any; menuItem: any };

  beforeEach(async () => {
    prisma = {
      botSettings: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      menuItem: { count: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [BotSettingsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(BotSettingsService);
  });

  it('get() returns the singleton row', async () => {
    prisma.botSettings.findUniqueOrThrow.mockResolvedValue({ id: 1, botEnabled: false });
    const result = await service.get();
    expect(result).toEqual({ id: 1, botEnabled: false });
    expect(prisma.botSettings.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('update() rejects enabling the bot when there are zero active menu items', async () => {
    prisma.menuItem.count.mockResolvedValue(0);
    await expect(service.update({ botEnabled: true })).rejects.toThrow(BadRequestException);
    expect(prisma.botSettings.update).not.toHaveBeenCalled();
  });

  it('update() allows enabling the bot when at least one menu item is active', async () => {
    prisma.menuItem.count.mockResolvedValue(2);
    prisma.botSettings.update.mockResolvedValue({ id: 1, botEnabled: true });
    const result = await service.update({ botEnabled: true });
    expect(result.botEnabled).toBe(true);
    expect(prisma.botSettings.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { botEnabled: true } });
  });

  it('update() allows non-enable updates without checking menu items', async () => {
    prisma.botSettings.update.mockResolvedValue({ id: 1, welcomeMessage: 'Oi!' });
    const result = await service.update({ welcomeMessage: 'Oi!' });
    expect(result.welcomeMessage).toBe('Oi!');
    expect(prisma.menuItem.count).not.toHaveBeenCalled();
  });

  it('autoDisableIfNoActiveMenuItems() sets botEnabled to false when zero items are active', async () => {
    prisma.menuItem.count.mockResolvedValue(0);
    await service.autoDisableIfNoActiveMenuItems();
    expect(prisma.botSettings.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { botEnabled: false } });
  });

  it('autoDisableIfNoActiveMenuItems() does nothing when active items remain', async () => {
    prisma.menuItem.count.mockResolvedValue(1);
    await service.autoDisableIfNoActiveMenuItems();
    expect(prisma.botSettings.update).not.toHaveBeenCalled();
  });
});
