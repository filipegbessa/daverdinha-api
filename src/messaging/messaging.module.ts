import { Module } from '@nestjs/common';
import { ConversationMessengerService } from './conversation-messenger.service';
import { WhatsAppClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [WhatsAppClientModule],
  providers: [ConversationMessengerService],
  exports: [ConversationMessengerService],
})
export class MessagingModule {}
