import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { StoreSettingsService } from './store-settings.service';
import { PrismaService } from '../prisma/prisma.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    siteEnabled: false,
    storeEnabled: false,
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

  it('exposes only the site and store switches and the installments publicly', async () => {
    await expect(service.getPublic()).resolves.toEqual({
      siteEnabled: false,
      storeEnabled: false,
      maxInstallments: 3,
      minInstallmentValue: 30,
    });
  });

  describe('store switch', () => {
    const env = { ...process.env };
    afterEach(() => {
      process.env = { ...env };
    });

    it('opens the store even without the Pagar.me key, and says the payment is not configured', async () => {
      delete process.env.PAGARME_SECRET_KEY;

      const settings = await service.update({ storeEnabled: true });

      expect(settings.storeEnabled).toBe(true);
      expect(settings.paymentConfigured).toBe(false);
    });

    it('reports the payment as configured once the key is set', async () => {
      process.env.PAGARME_SECRET_KEY = 'sk_test_x';

      expect((await service.get()).paymentConfigured).toBe(true);
    });

    it('switches the full site on and off', async () => {
      expect((await service.update({ siteEnabled: true })).siteEnabled).toBe(
        true,
      );
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
