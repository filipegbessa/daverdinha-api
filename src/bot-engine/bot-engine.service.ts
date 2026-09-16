import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryCheckService } from './delivery-check.service';
import { normalizeText } from '../common/normalize-text';
import {
  parseIncomingMessage,
  type OrderProductItem,
} from '../whatsapp/incoming-message';

const MAX_INVALID_ATTEMPTS = 3;
const MENU_PROMPT = 'Como posso te ajudar hoje?';
const MENU_BUTTON = 'Ver opções';
const STALE_HANDOFF_MS = 30 * 24 * 60 * 60 * 1000;

// Typing "menu" is the customer's escape hatch out of any sub-flow, so it's
// matched before anything else looks at the text.
const MENU_KEYWORD = 'menu';

// Persisted as a stand-in for the actual content on any message type the bot
// can't interpret (audio/sticker/video/etc — we never download or store the
// media itself). `image` is deliberately excluded from this bucket — it's
// ignored entirely for now, pending a dedicated image flow.
const INVALID_CONTENT_LABEL = '[Conteúdo inválido]';

/** The state a conversation is reset to whenever it returns to the bot. */
const BOT_ACTIVE_RESET = {
  status: 'bot_active',
  invalidAttempts: 0,
  awaitingDeliveryReply: false,
} as const;

/** Identifies the conversation a webhook call ended up touching. */
interface HandledMessage {
  conversationId: string;
}

@Injectable()
export class BotEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
    private readonly messenger: ConversationMessengerService,
    private readonly botSettings: BotSettingsService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryCheck: DeliveryCheckService,
  ) {}

  /**
   * Returns the conversation that was touched, or null when nothing was
   * processed (no message in the payload, or a webhook retry of one already
   * handled) so the caller can skip its own post-processing too.
   */
  async handleIncomingMessage(
    payload: unknown,
  ): Promise<HandledMessage | null> {
    const message = parseIncomingMessage(payload);
    if (!message) return null;

    if (message.id && (await this.isDuplicateMessage(message.id))) {
      return null;
    }

    const { conversation, isNew } = await this.resolveConversation(
      message.from,
      !!message.referredProductId,
    );
    const handled: HandledMessage = { conversationId: conversation.id };

    // Catalog orders get a bot reply unconditionally — even with the bot
    // disabled or the conversation already handed off to a human — since
    // the confirmation is about the order, not the general chat flow.
    if (message.type === 'order') {
      const settings = await this.botSettings.get();
      await this.handleOrderMessage(conversation, settings, message.order);
      return handled;
    }

    const text = message.text?.body;
    const isMenuKeyword = !!text && normalizeText(text) === MENU_KEYWORD;

    // A reply to the delivery-location sub-flow is persisted by
    // DeliveryCheckService itself, annotated with the resolved bairro
    // (e.g. "22211-200 (Catete)") instead of the raw CEP text.
    const isDeliveryReply =
      conversation.awaitingDeliveryReply && !!text && !isMenuKeyword;

    if (text && !isDeliveryReply) {
      await this.messenger.recordInbound(conversation.id, text);
    }

    const listReplyTitle = message.interactive?.list_reply?.title;
    if (listReplyTitle) {
      await this.messenger.recordInbound(conversation.id, listReplyTitle);
    }

    if (isMenuKeyword) {
      await this.resetToBot(conversation.id);
      await this.showMenu(conversation);
      return handled;
    }

    // The delivery-location sub-flow (however it started — order, menu
    // item, or catalog referral) is a short closed loop that always ends
    // in a human handoff, so a reply keeps it moving regardless of the
    // bot's enabled/paused state — otherwise the customer's answer to
    // "qual seu CEP?" would go unanswered.
    if (isDeliveryReply) {
      await this.deliveryCheck.handleReply(conversation, text);
      return handled;
    }

    if (conversation.status === 'paused_human') {
      // A handoff nobody ever picked up shouldn't strand the customer
      // forever — after a month, hand the conversation back to the bot.
      const isStale =
        Date.now() - conversation.updatedAt.getTime() > STALE_HANDOFF_MS;
      if (isStale) {
        await this.resetToBot(conversation.id);
      }
      return handled;
    }

    const settings = await this.botSettings.get();
    if (!settings.botEnabled) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'paused_human' },
      });
      return handled;
    }

    // 'image' is deliberately left out of the invalid-content bucket below —
    // ignored entirely for now, a dedicated image flow comes later.
    if (message.type === 'image') {
      return handled;
    }

    if (
      message.type &&
      message.type !== 'text' &&
      message.type !== 'interactive'
    ) {
      await this.handleUnsupportedMessage(conversation, settings);
      return handled;
    }

    if (message.referredProductId) {
      await this.deliveryCheck.start(conversation);
      return handled;
    }

    if (isNew) {
      await this.showMenu(conversation);
      return handled;
    }

    await this.handleMenuSelection(
      conversation,
      message.interactive?.list_reply?.id,
    );
    return handled;
  }

  private resetToBot(conversationId: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { ...BOT_ACTIVE_RESET },
    });
  }

  private async isDuplicateMessage(
    whatsappMessageId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.processedWebhookMessage.create({
        data: { whatsappMessageId },
      });
      return false;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return true;
      throw error;
    }
  }

  // Unlike every other terminal branch in this method, this one does NOT
  // hand off to a human — the bot replies and the conversation stays
  // exactly as it was (still bot_active, still awaiting whatever it was
  // awaiting), so the customer's next real message is handled normally.
  private async handleUnsupportedMessage(
    conversation: { id: string; phone: string },
    settings: { mediaReceivedMessage: string },
  ) {
    await this.messenger.recordInbound(
      conversation.id,
      INVALID_CONTENT_LABEL,
      'invalid_content',
    );
    await this.messenger.sendText(conversation, settings.mediaReceivedMessage);
  }

  private async handleOrderMessage(
    conversation: { id: string; phone: string },
    settings: { orderReceivedMessage: string },
    order:
      { catalog_id?: string; product_items?: OrderProductItem[] } | undefined,
  ) {
    const items = order?.product_items ?? [];
    const productNames = order?.catalog_id
      ? await this.whatsapp.getProductNames(
          order.catalog_id,
          items.map((item) => item.product_retailer_id),
        )
      : {};

    // The order rows are written directly rather than through the messenger,
    // because the message and its structured order have to land together — so
    // the unread bookkeeping the messenger normally does is repeated here.
    await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'inbound',
          kind: 'order',
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { unread: true },
      });
      await tx.order.create({
        data: {
          conversationId: conversation.id,
          messageId: message.id,
          catalogId: order?.catalog_id ?? '',
          items: {
            create: items.map((item) => ({
              productRetailerId: item.product_retailer_id,
              productName: productNames[item.product_retailer_id],
              quantity: Number(item.quantity),
              unitPrice: item.item_price,
              currency: item.currency,
            })),
          },
        },
      });
    });

    await this.messenger.sendText(conversation, settings.orderReceivedMessage);

    // Hand off to a human only happens once the delivery-location sub-flow
    // resolves (covered/not covered/unrecognized after retries) — by then
    // the attendant has both the order and whether we deliver there.
    await this.deliveryCheck.start(conversation);
  }

  private async resolveConversation(phone: string, isCatalogEntry: boolean) {
    const existing = await this.prisma.conversation.findFirst({
      where: { phone },
    });
    if (existing) return { conversation: existing, isNew: false };

    const created = await this.prisma.conversation.create({
      data: {
        phone,
        status: 'bot_active',
        entryPoint: isCatalogEntry ? 'catalog' : 'menu',
      },
    });
    return { conversation: created, isNew: true };
  }

  private async showMenu(conversation: { id: string; phone: string }) {
    const settings = await this.botSettings.get();
    const items = (await this.menuItems.listActive()).map((item) => ({
      id: item.id,
      title: item.topic,
    }));

    await this.messenger.sendText(conversation, settings.welcomeMessage);
    await this.messenger.sendMenu(
      conversation,
      MENU_PROMPT,
      MENU_BUTTON,
      items,
    );
  }

  private async handleMenuSelection(
    conversation: { id: string; phone: string; invalidAttempts: number },
    selectedItemId: string | undefined,
  ) {
    const selected = (await this.menuItems.listActive()).find(
      (item) => item.id === selectedItemId,
    );

    if (!selected) {
      await this.registerInvalidAttempt(conversation);
      return;
    }

    // Picking any menu item is an explicit new intent — it must cancel a
    // delivery sub-flow left mid-way (e.g. asked for a CEP, then the
    // customer picked "Falar com um atendente" instead of answering).
    // Otherwise the flag lingers and the next free-text message the
    // customer sends gets misrouted into the CEP validator.
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { invalidAttempts: 0, awaitingDeliveryReply: false },
    });

    // The one system item is the delivery-location flow, which owns its own
    // set of messages and its own handoff. Every other item is the simple
    // topic + reply the admin creates: answer, then hand to a human.
    if (selected.isSystem) {
      await this.deliveryCheck.start(conversation);
      return;
    }

    await this.messenger.sendText(conversation, selected.reply ?? '');
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'paused_human' },
    });
  }

  private async registerInvalidAttempt(conversation: {
    id: string;
    phone: string;
    invalidAttempts: number;
  }) {
    const attempts = conversation.invalidAttempts + 1;

    if (attempts >= MAX_INVALID_ATTEMPTS) {
      const settings = await this.botSettings.get();
      await this.messenger.sendText(
        conversation,
        settings.invalidAttemptsExceededMessage,
      );
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'paused_human', invalidAttempts: attempts },
      });
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { invalidAttempts: attempts },
    });
    await this.showMenu(conversation);
  }
}
