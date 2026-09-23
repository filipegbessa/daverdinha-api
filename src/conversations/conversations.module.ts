import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { MediaStorageModule } from '../media/media-storage.module';

@Module({
  imports: [ClerkAuthModule, MessagingModule, MediaStorageModule],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
