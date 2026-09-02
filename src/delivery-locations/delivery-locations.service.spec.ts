import { Test } from '@nestjs/testing';
import { DeliveryLocationsService } from './delivery-locations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeliveryLocationsService', () => {
  let service: DeliveryLocationsService;
  let prisma: { deliveryLocation: any };

  beforeEach(async () => {
    prisma = {
      deliveryLocation: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryLocationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(DeliveryLocationsService);
  });

  it('list() returns all locations ordered by zone then regionName', async () => {
    prisma.deliveryLocation.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.deliveryLocation.findMany).toHaveBeenCalledWith({
      orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
    });
  });

  it('create() persists a new location', async () => {
    const dto = { zone: 'Zona Sul', regionName: 'Urca', covered: true };
    prisma.deliveryLocation.create.mockResolvedValue({ id: '1', ...dto });
    const result = await service.create(dto);
    expect(prisma.deliveryLocation.create).toHaveBeenCalledWith({ data: dto });
    expect(result.regionName).toBe('Urca');
  });

  it('update() patches an existing location', async () => {
    prisma.deliveryLocation.update.mockResolvedValue({
      id: '1',
      covered: false,
    });
    const result = await service.update('1', { covered: false });
    expect(prisma.deliveryLocation.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { covered: false },
    });
    expect(result.covered).toBe(false);
  });

  it('remove() deletes a location', async () => {
    prisma.deliveryLocation.delete.mockResolvedValue({ id: '1' });
    await service.remove('1');
    expect(prisma.deliveryLocation.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });
});
