import { PublicStoreSettingsController } from './public-store-settings.controller';
import { StoreSettingsController } from './store-settings.controller';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('store settings controllers', () => {
  it('keeps the public one free of guards, so the site reads it without a token', () => {
    expect(
      Reflect.getMetadata('__guards__', PublicStoreSettingsController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        '__guards__',
        PublicStoreSettingsController.prototype.getPublic,
      ),
    ).toBeUndefined();
  });

  it('keeps the admin one behind Clerk', () => {
    expect(Reflect.getMetadata('__guards__', StoreSettingsController)).toEqual([
      ClerkAuthGuard,
    ]);
  });
});
