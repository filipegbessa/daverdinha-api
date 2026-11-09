import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeliveryAreasService } from './delivery-areas.service';
import { PrismaService } from '../prisma/prisma.service';

function area(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    zone: 'Zona Sul',
    name: 'Perto',
    fee: new Prisma.Decimal('15.00'),
    locations: [] as { id: string; regionName: string; covered: boolean }[],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DeliveryAreasService', () => {
  let service: DeliveryAreasService;
  let prisma: {
    deliveryArea: Record<string, jest.Mock>;
    deliveryLocation: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      deliveryArea: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(area()),
        create: jest.fn(({ data }) => area(data)),
        update: jest.fn(({ data }) => area(data)),
        delete: jest.fn(),
      },
      deliveryLocation: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryAreasService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(DeliveryAreasService);
  });

  describe('listByZone', () => {
    it('groups areas by zone and lists covered bairros that have no area yet', async () => {
      prisma.deliveryArea.findMany.mockResolvedValue([
        area({
          locations: [{ id: 'l1', regionName: 'Catete', covered: true }],
        }),
      ]);
      prisma.deliveryLocation.findMany.mockResolvedValue([
        {
          id: 'l1',
          zone: 'Zona Sul',
          regionName: 'Catete',
          covered: true,
          areaId: 'a1',
        },
        {
          id: 'l2',
          zone: 'Zona Sul',
          regionName: 'Flamengo',
          covered: true,
          areaId: null,
        },
        {
          id: 'l3',
          zone: 'Zona Sul',
          regionName: 'Gávea',
          covered: false,
          areaId: null,
        },
        {
          id: 'l4',
          zone: 'Centro',
          regionName: 'Gamboa',
          covered: true,
          areaId: null,
        },
      ]);

      await expect(service.listByZone()).resolves.toEqual([
        {
          zone: 'Centro',
          areas: [],
          unassigned: [{ id: 'l4', regionName: 'Gamboa' }],
        },
        {
          zone: 'Zona Sul',
          areas: [
            {
              id: 'a1',
              zone: 'Zona Sul',
              name: 'Perto',
              fee: 15,
              locations: [{ id: 'l1', regionName: 'Catete', covered: true }],
            },
          ],
          unassigned: [{ id: 'l2', regionName: 'Flamengo' }],
        },
      ]);
    });
  });

  describe('create', () => {
    it('creates an area in a zone that exists, with the fee as a Decimal', async () => {
      const result = await service.create({
        zone: 'Zona Sul',
        name: 'Perto',
        fee: 12.5,
      });

      expect(prisma.deliveryArea.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            zone: 'Zona Sul',
            name: 'Perto',
            fee: new Prisma.Decimal(12.5),
          },
        }),
      );
      expect(result.fee).toBe(12.5);
    });

    it('is a 404 for a zone no bairro has', async () => {
      prisma.deliveryLocation.count.mockResolvedValue(0);

      await expect(
        service.create({ zone: 'Zona Lunar', name: 'Perto', fee: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('is a 409 when the zone already has an area with that name', async () => {
      prisma.deliveryArea.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['zone', 'name'] },
      });

      await expect(
        service.create({ zone: 'Zona Sul', name: 'Perto', fee: 10 }),
      ).rejects.toThrow(
        new ConflictException('Já existe uma área com esse nome nessa zona.'),
      );
    });
  });

  describe('update and remove', () => {
    it('only writes what was sent', async () => {
      await service.update('a1', { fee: 20 });

      expect(prisma.deliveryArea.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fee: new Prisma.Decimal(20) } }),
      );
    });

    it('is a 404 for an area that does not exist', async () => {
      prisma.deliveryArea.findUnique.mockResolvedValue(null);

      await expect(service.update('x', { fee: 1 })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove('x')).rejects.toThrow(NotFoundException);
      expect(prisma.deliveryArea.delete).not.toHaveBeenCalled();
    });
  });

  describe('setLocations', () => {
    it('replaces the whole list: frees the bairros that left and takes the new ones', async () => {
      prisma.deliveryLocation.findMany.mockResolvedValue([
        { id: 'l1', zone: 'Zona Sul' },
        { id: 'l2', zone: 'Zona Sul' },
      ]);

      await service.setLocations('a1', ['l1', 'l2', 'l1']);

      expect(prisma.deliveryLocation.updateMany).toHaveBeenNthCalledWith(1, {
        where: { areaId: 'a1', id: { notIn: ['l1', 'l2'] } },
        data: { areaId: null },
      });
      expect(prisma.deliveryLocation.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: ['l1', 'l2'] } },
        data: { areaId: 'a1' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refuses a bairro from another zone', async () => {
      prisma.deliveryLocation.findMany.mockResolvedValue([
        { id: 'l1', zone: 'Centro' },
      ]);

      await expect(service.setLocations('a1', ['l1'])).rejects.toThrow(
        new BadRequestException('Só dá pra incluir bairros da zona Zona Sul.'),
      );
      expect(prisma.deliveryLocation.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an unknown bairro', async () => {
      prisma.deliveryLocation.findMany.mockResolvedValue([]);

      await expect(service.setLocations('a1', ['nope'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts an empty list, which empties the area', async () => {
      await service.setLocations('a1', []);

      expect(prisma.deliveryLocation.updateMany).toHaveBeenNthCalledWith(1, {
        where: { areaId: 'a1', id: { notIn: [] } },
        data: { areaId: null },
      });
    });
  });

  describe('feeForLocation', () => {
    it('returns the area name and fee of the bairro', async () => {
      prisma.deliveryLocation.findUnique.mockResolvedValue({
        area: { name: 'Perto', fee: new Prisma.Decimal('15.00') },
      });

      await expect(service.feeForLocation('l1')).resolves.toEqual({
        area: 'Perto',
        fee: new Prisma.Decimal('15.00'),
      });
    });

    it('is null for a bairro without an area, so there is never free delivery by mistake', async () => {
      prisma.deliveryLocation.findUnique.mockResolvedValue({ area: null });

      await expect(service.feeForLocation('l2')).resolves.toBeNull();
    });
  });
});
