import { Test } from '@nestjs/testing';
import { DeliveryLocationsService } from './delivery-locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CepLookupService } from '../cep-lookup/cep-lookup.service';

describe('DeliveryLocationsService', () => {
  let service: DeliveryLocationsService;
  let prisma: { deliveryLocation: any };
  let cepLookup: { lookup: jest.Mock };

  beforeEach(async () => {
    prisma = {
      deliveryLocation: { findMany: jest.fn(), update: jest.fn() },
    };
    cepLookup = { lookup: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryLocationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CepLookupService, useValue: cepLookup },
      ],
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
    prisma.deliveryLocation.update.mockResolvedValue({
      id: 'l1',
      covered: false,
    });

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

  describe('listCoveredByZone()', () => {
    it('returns only covered bairros, grouped under their zone', async () => {
      prisma.deliveryLocation.findMany.mockResolvedValue([
        { zone: 'Centro', regionName: 'Gamboa' },
        { zone: 'Centro', regionName: 'Santo Cristo' },
        { zone: 'Zona Sul', regionName: 'Botafogo' },
      ]);

      const result = await service.listCoveredByZone();

      expect(prisma.deliveryLocation.findMany).toHaveBeenCalledWith({
        where: { covered: true },
        orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
        select: { zone: true, regionName: true },
      });
      expect(result).toEqual([
        { zone: 'Centro', bairros: ['Gamboa', 'Santo Cristo'] },
        { zone: 'Zona Sul', bairros: ['Botafogo'] },
      ]);
    });

    it('returns an empty list when nothing is covered, rather than empty zones', async () => {
      prisma.deliveryLocation.findMany.mockResolvedValue([]);

      await expect(service.listCoveredByZone()).resolves.toEqual([]);
    });
  });

  describe('resolveCep', () => {
    const locations = [
      {
        id: 'l1',
        zone: 'Zona Sul',
        regionName: 'Ipanema',
        covered: true,
        cepRanges: [{ startCep: 22410000, endCep: 22471999 }],
      },
      {
        id: 'l2',
        zone: 'Zona Oeste',
        regionName: 'Barra da Tijuca',
        covered: false,
        cepRanges: [{ startCep: 22600000, endCep: 22799999 }],
      },
      {
        id: 'l3',
        zone: 'Zona Sul',
        regionName: 'Catete',
        covered: true,
        cepRanges: [],
      },
    ];

    beforeEach(() => {
      prisma.deliveryLocation.findMany.mockResolvedValue(locations);
    });

    it('uses a seeded CepRange before calling BrasilAPI', async () => {
      await expect(service.resolveCep('22420-000')).resolves.toEqual({
        status: 'covered',
        bairro: 'Ipanema',
        zone: 'Zona Sul',
        locationId: 'l1',
      });
      expect(cepLookup.lookup).not.toHaveBeenCalled();
    });

    it('reports not_covered for a CepRange whose location is not covered', async () => {
      await expect(service.resolveCep('22640100')).resolves.toEqual({
        status: 'not_covered',
        bairro: 'Barra da Tijuca',
        zone: 'Zona Oeste',
        locationId: 'l2',
      });
    });

    it('falls back to BrasilAPI and matches the bairro ignoring case and accents', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'CATÉTE' });

      await expect(service.resolveCep('22220000')).resolves.toEqual({
        status: 'covered',
        bairro: 'Catete',
        zone: 'Zona Sul',
        locationId: 'l3',
      });
      expect(cepLookup.lookup).toHaveBeenCalledWith('22220000');
    });

    it('reports not_covered with the BrasilAPI bairro when no location matches', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'Niterói Centro' });

      await expect(service.resolveCep('24020000')).resolves.toEqual({
        status: 'not_covered',
        bairro: 'Niterói Centro',
      });
    });

    it('never matches a bairro of another city with the same name', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'Catete', city: 'Niterói' });

      await expect(service.resolveCep('24020000')).resolves.toEqual({
        status: 'not_covered',
        bairro: 'Catete (Niterói)',
      });
    });

    it('matches when BrasilAPI says the CEP is in Rio', async () => {
      cepLookup.lookup.mockResolvedValue({
        bairro: 'Catete',
        city: 'Rio de Janeiro',
      });

      await expect(service.resolveCep('22220000')).resolves.toEqual(
        expect.objectContaining({ status: 'covered', bairro: 'Catete' }),
      );
    });

    it('reports unresolved for a CEP that is not 8 digits, without any lookup', async () => {
      await expect(service.resolveCep('2221')).resolves.toEqual({
        status: 'unresolved',
      });
      expect(prisma.deliveryLocation.findMany).not.toHaveBeenCalled();
      expect(cepLookup.lookup).not.toHaveBeenCalled();
    });

    it('reports unresolved when BrasilAPI fails or times out', async () => {
      cepLookup.lookup.mockResolvedValue(null);

      await expect(service.resolveCep('22999999')).resolves.toEqual({
        status: 'unresolved',
      });
    });
  });
});
