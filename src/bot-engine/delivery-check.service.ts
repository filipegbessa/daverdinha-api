import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { normalizeText } from '../common/normalize-text';

@Injectable()
export class DeliveryCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
    private readonly botSettings: BotSettingsService,
    private readonly deliveryLocations: DeliveryLocationsService,
  ) {}

  async start(conversation: { id: string; phone: string }): Promise<void> {
    const settings = await this.botSettings.get();
    await this.whatsapp.sendText(conversation.phone, settings.deliveryPrompt);
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: true },
    });
  }

  async handleReply(
    conversation: { id: string; phone: string },
    text: string,
  ): Promise<void> {
    const locations = await this.deliveryLocations.list();
    const normalizedInput = normalizeText(text);
    const match = locations.find((location) =>
      normalizedInput.includes(normalizeText(location.regionName)),
    );

    if (!match) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
      return;
    }

    if (match.covered) {
      const settings = await this.botSettings.get();
      await this.whatsapp.sendText(conversation.phone, settings.deliveryWaitMessage);
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
      return;
    }

    await this.whatsapp.sendText(
      conversation.phone,
      'Poxa, ainda não entregamos nessa região 💚',
    );
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: false },
    });
  }
}
