import { Test } from '@nestjs/testing';
import { PublicDeliveryLocationsController } from './public-delivery-locations.controller';
import { DeliveryLocationsService } from './delivery-locations.service';

describe('PublicDeliveryLocationsController', () => {
  let controller: PublicDeliveryLocationsController;
  let service: { listCoveredByZone: jest.Mock; resolveCep: jest.Mock };

  beforeEach(async () => {
    service = { listCoveredByZone: jest.fn(), resolveCep: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicDeliveryLocationsController],
      providers: [{ provide: DeliveryLocationsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(PublicDeliveryLocationsController);
  });

  it('returns the covered zones', async () => {
    const zones = [{ zone: 'Centro', bairros: ['Gamboa'] }];
    service.listCoveredByZone.mockResolvedValue(zones);

    await expect(controller.listCovered()).resolves.toBe(zones);
  });

  it('checks a CEP without exposing the zone or the location id', async () => {
    service.resolveCep.mockResolvedValue({
      status: 'covered',
      bairro: 'Catete',
      zone: 'Zona Sul',
      locationId: 'l1',
    });

    await expect(controller.check({ cep: '22220-000' })).resolves.toEqual({
      status: 'covered',
      bairro: 'Catete',
    });
    expect(service.resolveCep).toHaveBeenCalledWith('22220-000');
  });

  it('answers unresolved with nothing else', async () => {
    service.resolveCep.mockResolvedValue({ status: 'unresolved' });

    await expect(controller.check({ cep: 'abc' })).resolves.toEqual({
      status: 'unresolved',
    });
  });

  it('carries no auth guard — the public site reads it with no token', () => {
    // Guard metadata is what Nest reads to decide; asserting its absence is
    // what keeps a future refactor from quietly locking the site out.
    const onClass = Reflect.getMetadata(
      '__guards__',
      PublicDeliveryLocationsController,
    );
    expect(onClass).toBeUndefined();
    for (const route of [controller.listCovered, controller.check]) {
      expect(Reflect.getMetadata('__guards__', route)).toBeUndefined();
    }
  });
});
