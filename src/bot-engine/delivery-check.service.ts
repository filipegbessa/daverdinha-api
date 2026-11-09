import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';

const MAX_DELIVERY_CEP_ATTEMPTS = 2;

// Placeholder the admin can drop into the confirmed/not-covered messages to
// have the resolved bairro spliced in ("entregamos aí no [local]").
const LOCATION_PLACEHOLDER = /\[local\]/g;

@Injectable()
export class DeliveryCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: ConversationMessengerService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryLocations: DeliveryLocationsService,
  ) {}

  async start(conversation: { id: string; phone: string }): Promise<void> {
    const item = await this.menuItems.findSystemDeliveryItem();
    await this.messenger.sendText(conversation, item.deliveryPrompt ?? '');
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: true, invalidAttempts: 0 },
    });
  }

  async handleReply(
    conversation: { id: string; phone: string; invalidAttempts: number },
    text: string,
  ): Promise<void> {
    // Mesma resolução do checador de CEP do site (faixas locais primeiro,
    // BrasilAPI depois), pra os dois nunca darem respostas diferentes.
    const result = await this.deliveryLocations.resolveCep(text);

    // Annotated with the bairro we resolved, so the operator reading the
    // transcript sees "22211-200 (Catete)" rather than a bare number.
    await this.messenger.recordInbound(
      conversation.id,
      result.status === 'unresolved' ? text : `${text} (${result.bairro})`,
    );

    if (result.status === 'unresolved') {
      await this.registerUnresolvedAttempt(conversation);
      return;
    }

    const item = await this.menuItems.findSystemDeliveryItem();
    const template =
      result.status === 'covered'
        ? (item.deliveryConfirmedMessage ?? '')
        : (item.deliveryNotCoveredMessage ?? '');

    await this.messenger.sendText(
      conversation,
      template.replace(LOCATION_PLACEHOLDER, result.bairro),
    );
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingDeliveryReply: false, status: 'paused_human' },
    });
  }

  /**
   * Same escalation the CEP-retry path uses (`deliveryRetryMessage` then
   * `deliveryUnrecognizedMessage` + handoff), exposed for callers that
   * already recorded the inbound message themselves — an image during the
   * CEP wait, for instance — and only need the counting/reply half, not a
   * second write of the message.
   */
  async registerUnresolvedAttempt(conversation: {
    id: string;
    phone: string;
    invalidAttempts: number;
  }) {
    const attempts = conversation.invalidAttempts + 1;
    const item = await this.menuItems.findSystemDeliveryItem();

    if (attempts >= MAX_DELIVERY_CEP_ATTEMPTS) {
      await this.messenger.sendText(
        conversation,
        item.deliveryUnrecognizedMessage ?? '',
      );
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          awaitingDeliveryReply: false,
          status: 'paused_human',
          invalidAttempts: attempts,
        },
      });
      return;
    }

    await this.messenger.sendText(
      conversation,
      item.deliveryRetryMessage ?? '',
    );
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { invalidAttempts: attempts },
    });
  }
}
