import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { WhatsAppClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [ClerkAuthModule, WhatsAppClientModule],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
