import { Module } from '@nestjs/common';
import { ConversationMessengerService } from './conversation-messenger.service';
import { WhatsAppClientModule } from '../whatsapp/whatsapp-client.module';
import { MediaStorageModule } from '../media/media-storage.module';

@Module({
  imports: [WhatsAppClientModule, MediaStorageModule],
  providers: [ConversationMessengerService],
  exports: [ConversationMessengerService],
})
export class MessagingModule {}
