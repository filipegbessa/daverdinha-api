import { DeliveryLocationsController } from './delivery-locations.controller';
import { DeliveryAreasController } from './delivery-areas.controller';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('delivery admin controllers', () => {
  // As rotas públicas (lista e `/check`) moram em PublicDeliveryLocationsController.
  it('mantém bairros e áreas de entrega atrás do Clerk', () => {
    expect(
      Reflect.getMetadata('__guards__', DeliveryLocationsController),
    ).toEqual([ClerkAuthGuard]);
    expect(Reflect.getMetadata('__guards__', DeliveryAreasController)).toEqual([
      ClerkAuthGuard,
    ]);
  });
});
