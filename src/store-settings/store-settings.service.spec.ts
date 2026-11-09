import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { StoreSettingsService } from './store-settings.service';
import { PrismaService } from '../prisma/prisma.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    pickupEnabled: true,
    pickupAddress: 'R. Capiberibe, 32',
    pickupHours: 'Seg a sex, 10h às 18h',
    pickupInstructions: null,
    maxInstallments: 3,
    minInstallmentValue: new Prisma.Decimal('30.00'),
    updatedAt: new Date('2026-11-09T12:00:00Z'),
    ...overrides,
  };
}

describe('StoreSettingsService', () => {
  let service: StoreSettingsService;
  let prisma: { storeSettings: { upsert: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      storeSettings: {
        upsert: jest.fn().mockResolvedValue(row()),
        update: jest.fn(({ data }) => row(data)),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StoreSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(StoreSettingsService);
  });

  it('reads row 1, creating it with the atelier address when it is missing', async () => {
    const settings = await service.get();

    expect(prisma.storeSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {},
      create: expect.objectContaining({
        id: 1,
        pickupAddress: expect.stringContaining('R. Capiberibe, 32'),
      }),
    });
    expect(settings.minInstallmentValue).toBe(30);
  });

  it('only exposes the installment settings publicly', async () => {
    await expect(service.getPublic()).resolves.toEqual({
      maxInstallments: 3,
      minInstallmentValue: 30,
    });
  });

  it('updates only what was sent, with money as a Decimal', async () => {
    const result = await service.update({
      pickupEnabled: false,
      minInstallmentValue: 25.5,
    });

    expect(prisma.storeSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        pickupEnabled: false,
        minInstallmentValue: new Prisma.Decimal(25.5),
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        pickupEnabled: false,
        minInstallmentValue: 25.5,
      }),
    );
  });
});
