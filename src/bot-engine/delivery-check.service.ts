import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { normalizeText } from '../common/normalize-text';

@Injectable()
export class DeliveryCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryLocations: DeliveryLocationsService,
  ) {}

  async start(conversation: { id: string; phone: string }): Promise<void> {
    const item = await this.menuItems.findSystemDeliveryItem();
    await this.sendAndPersist(conversation, item.deliveryPrompt ?? '');
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: true },
    });
  }

  async handleReply(
    conversation: { id: string; phone: string },
    text: string,
  ): Promise<void> {
    const item = await this.menuItems.findSystemDeliveryItem();
    const locations = await this.deliveryLocations.list();
    const normalizedInput = normalizeText(text);
    const match = locations.find((location) =>
      normalizedInput.includes(normalizeText(location.regionName)),
    );

    const body = !match
      ? item.deliveryUnrecognizedMessage ?? ''
      : match.covered
        ? item.deliveryConfirmedMessage ?? ''
        : item.deliveryNotCoveredMessage ?? '';

    await this.sendAndPersist(conversation, body);
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: false, status: 'paused_human' },
    });
  }

  private async sendAndPersist(
    conversation: { id: string; phone: string },
    body: string,
  ) {
    await this.whatsapp.sendText(conversation.phone, body);
    await this.prisma.message.create({
      data: { conversationId: conversation.id, direction: 'outbound', body },
    });
  }
}
