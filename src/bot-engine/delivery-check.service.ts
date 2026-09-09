import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { CepLookupService } from '../cep-lookup/cep-lookup.service';
import { normalizeText } from '../common/normalize-text';

const MAX_DELIVERY_CEP_ATTEMPTS = 2;

type ResolutionResult =
  | { kind: 'covered'; covered: boolean }
  | { kind: 'not-covered' }
  | { kind: 'unresolved' };

@Injectable()
export class DeliveryCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryLocations: DeliveryLocationsService,
    private readonly cepLookup: CepLookupService,
  ) {}

  async start(conversation: { id: string; phone: string }): Promise<void> {
    const item = await this.menuItems.findSystemDeliveryItem();
    await this.sendAndPersist(conversation, item.deliveryPrompt ?? '');
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: true, invalidAttempts: 0 },
    });
  }

  async handleReply(
    conversation: { id: string; phone: string; invalidAttempts: number },
    text: string,
  ): Promise<void> {
    const cep = text.replace(/\D/g, '');
    const result = await this.resolveLocation(cep);

    if (result.kind === 'unresolved') {
      await this.registerUnresolvedAttempt(conversation);
      return;
    }

    const item = await this.menuItems.findSystemDeliveryItem();
    const body =
      result.kind === 'covered' && result.covered
        ? item.deliveryConfirmedMessage ?? ''
        : item.deliveryNotCoveredMessage ?? '';

    await this.sendAndPersist(conversation, body);
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: false, status: 'paused_human' },
    });
  }

  private async resolveLocation(cep: string): Promise<ResolutionResult> {
    if (cep.length !== 8) return { kind: 'unresolved' };
    const cepNumber = Number(cep);

    const locations = await this.deliveryLocations.list();
    const localMatch = locations.find((loc) =>
      loc.cepRanges.some((range) => cepNumber >= range.startCep && cepNumber <= range.endCep),
    );
    if (localMatch) return { kind: 'covered', covered: localMatch.covered };

    const lookup = await this.cepLookup.lookup(cep);
    if (!lookup) return { kind: 'unresolved' };

    const normalizedBairro = normalizeText(lookup.bairro);
    const apiMatch = locations.find((loc) => normalizeText(loc.regionName) === normalizedBairro);
    if (apiMatch) return { kind: 'covered', covered: apiMatch.covered };

    return { kind: 'not-covered' };
  }

  private async registerUnresolvedAttempt(conversation: {
    id: string;
    phone: string;
    invalidAttempts: number;
  }) {
    const attempts = conversation.invalidAttempts + 1;
    const item = await this.menuItems.findSystemDeliveryItem();

    if (attempts >= MAX_DELIVERY_CEP_ATTEMPTS) {
      await this.sendAndPersist(conversation, item.deliveryUnrecognizedMessage ?? '');
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { awaitingDeliveryReply: false, status: 'paused_human', invalidAttempts: attempts },
      });
      return;
    }

    await this.sendAndPersist(conversation, item.deliveryRetryMessage ?? '');
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { invalidAttempts: attempts },
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
