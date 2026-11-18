import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { BlobStorageModule } from '../media/blob-storage.module';
import { HeroSlidesService } from './hero-slides.service';
import { HeroSlidesController } from './hero-slides.controller';
import { PublicHeroSlidesController } from './public-hero-slides.controller';

@Module({
  imports: [ClerkAuthModule, BlobStorageModule],
  providers: [HeroSlidesService],
  // O público primeiro: `GET /hero-slides/active` sem token não pode cair no
  // `GET /hero-slides/:id` do admin.
  controllers: [PublicHeroSlidesController, HeroSlidesController],
})
export class HeroSlidesModule {}
