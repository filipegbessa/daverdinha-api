import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { BlobStorageModule } from '../media/blob-storage.module';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';

@Module({
  imports: [ClerkAuthModule, BlobStorageModule],
  providers: [EventsService],
  // O público vem primeiro, como no catálogo: as rotas `GET /events/...`
  // sem token não podem cair no guard do admin.
  controllers: [PublicEventsController, EventsController],
  exports: [EventsService],
})
export class EventsModule {}
