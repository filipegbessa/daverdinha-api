import { Test } from '@nestjs/testing';
import { PublicDeliveryLocationsController } from './public-delivery-locations.controller';
import { DeliveryLocationsService } from './delivery-locations.service';

describe('PublicDeliveryLocationsController', () => {
  let controller: PublicDeliveryLocationsController;
  let service: { listCoveredByZone: jest.Mock };

  beforeEach(async () => {
    service = { listCoveredByZone: jest.fn() };
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

  it('carries no auth guard — the public site reads it with no token', () => {
    // Guard metadata is what Nest reads to decide; asserting its absence is
    // what keeps a future refactor from quietly locking the site out.
    const onClass = Reflect.getMetadata(
      '__guards__',
      PublicDeliveryLocationsController,
    );
    const onRoute = Reflect.getMetadata('__guards__', controller.listCovered);
    expect(onClass).toBeUndefined();
    expect(onRoute).toBeUndefined();
  });
});
