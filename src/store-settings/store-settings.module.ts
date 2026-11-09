import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { StoreSettingsService } from './store-settings.service';
import { StoreSettingsController } from './store-settings.controller';
import { PublicStoreSettingsController } from './public-store-settings.controller';

@Module({
  imports: [ClerkAuthModule],
  providers: [StoreSettingsService],
  // O público primeiro, pra `GET /store-settings/public` nunca passar pelo guard.
  controllers: [PublicStoreSettingsController, StoreSettingsController],
  exports: [StoreSettingsService],
})
export class StoreSettingsModule {}
