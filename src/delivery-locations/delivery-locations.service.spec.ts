import { Test } from '@nestjs/testing';
import { DeliveryLocationsService } from './delivery-locations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeliveryLocationsService', () => {
  let service: DeliveryLocationsService;
  let prisma: { deliveryLocation: any };

  beforeEach(async () => {
    prisma = {
      deliveryLocation: { findMany: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DeliveryLocationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DeliveryLocationsService);
  });

  it('list() orders by zone then regionName and includes cepRanges', async () => {
    prisma.deliveryLocation.findMany.mockResolvedValue([]);

    await service.list();

    expect(prisma.deliveryLocation.findMany).toHaveBeenCalledWith({
      orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
      include: { cepRanges: true },
    });
  });

  it('update() only ever writes the covered field', async () => {
    prisma.deliveryLocation.update.mockResolvedValue({ id: 'l1', covered: false });

    await service.update('l1', { covered: false });

    expect(prisma.deliveryLocation.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { covered: false },
    });
  });

  it('has no create method', () => {
    expect((service as any).create).toBeUndefined();
  });

  it('has no remove method', () => {
    expect((service as any).remove).toBeUndefined();
  });
});
