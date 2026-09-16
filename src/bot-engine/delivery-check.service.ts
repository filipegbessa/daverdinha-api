import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { CepLookupService } from '../cep-lookup/cep-lookup.service';
import { normalizeText } from '../common/normalize-text';

const MAX_DELIVERY_CEP_ATTEMPTS = 2;

// Placeholder the admin can drop into the confirmed/not-covered messages to
// have the resolved bairro spliced in ("entregamos aí no [local]").
const LOCATION_PLACEHOLDER = /\[local\]/g;

type ResolutionResult =
  | { kind: 'covered'; covered: boolean; bairro: string }
  | { kind: 'not-covered'; bairro: string }
  | { kind: 'unresolved' };

@Injectable()
export class DeliveryCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: ConversationMessengerService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryLocations: DeliveryLocationsService,
    private readonly cepLookup: CepLookupService,
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
    const cep = text.replace(/\D/g, '');
    const result = await this.resolveLocation(cep);

    // Annotated with the bairro we resolved, so the operator reading the
    // transcript sees "22211-200 (Catete)" rather than a bare number.
    await this.messenger.recordInbound(
      conversation.id,
      result.kind === 'unresolved' ? text : `${text} (${result.bairro})`,
    );

    if (result.kind === 'unresolved') {
      await this.registerUnresolvedAttempt(conversation);
      return;
    }

    const item = await this.menuItems.findSystemDeliveryItem();
    const template =
      result.kind === 'covered' && result.covered
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
   * Our own CEP ranges win over the external lookup: they're the ranges the
   * owner curated, so they stay authoritative even if BrasilAPI disagrees
   * or is down.
   */
  private async resolveLocation(cep: string): Promise<ResolutionResult> {
    if (cep.length !== 8) return { kind: 'unresolved' };
    const cepNumber = Number(cep);

    const locations = await this.deliveryLocations.list();
    const localMatch = locations.find((loc) =>
      loc.cepRanges.some(
        (range) => cepNumber >= range.startCep && cepNumber <= range.endCep,
      ),
    );
    if (localMatch)
      return {
        kind: 'covered',
        covered: localMatch.covered,
        bairro: localMatch.regionName,
      };

    const lookup = await this.cepLookup.lookup(cep);
    if (!lookup) return { kind: 'unresolved' };

    const normalizedBairro = normalizeText(lookup.bairro);
    const apiMatch = locations.find(
      (loc) => normalizeText(loc.regionName) === normalizedBairro,
    );
    if (apiMatch)
      return {
        kind: 'covered',
        covered: apiMatch.covered,
        bairro: apiMatch.regionName,
      };

    return { kind: 'not-covered', bairro: lookup.bairro };
  }

  private async registerUnresolvedAttempt(conversation: {
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
