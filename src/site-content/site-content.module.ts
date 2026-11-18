import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { BlobStorageModule } from '../media/blob-storage.module';
import { SiteContentService } from './site-content.service';
import { SiteContentController } from './site-content.controller';
import { PublicSiteContentController } from './public-site-content.controller';

@Module({
  imports: [ClerkAuthModule, BlobStorageModule],
  providers: [SiteContentService],
  controllers: [PublicSiteContentController, SiteContentController],
})
export class SiteContentModule {}
