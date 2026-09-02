import { Module } from '@nestjs/common';
import { WhatsAppClientService } from './whatsapp-client.service';

@Module({
  providers: [WhatsAppClientService],
  exports: [WhatsAppClientService],
})
export class WhatsAppClientModule {}
