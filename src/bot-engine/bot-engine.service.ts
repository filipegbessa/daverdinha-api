import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryCheckService } from './delivery-check.service';
import { normalizeText } from '../common/normalize-text';

const MAX_INVALID_ATTEMPTS = 3;
const DEFAULT_NO_MATCH_REPLY = 'Não entendi sua resposta, vou te chamar um atendente!';
const MENU_PROMPT = 'Como posso te ajudar hoje?';
const STALE_HANDOFF_MS = 30 * 24 * 60 * 60 * 1000;

// Persisted as a stand-in for the actual content on any message type the bot
// can't interpret (audio/sticker/video/etc — we never download or store the
// media itself). `image` is deliberately excluded from this bucket — it's
// ignored entirely for now, pending a dedicated image flow.
const INVALID_CONTENT_LABEL = '[Conteúdo inválido]';

interface OrderProductItem {
  product_retailer_id: string;
  quantity: string;
  item_price?: string;
  currency?: string;
}

interface IncomingMessage {
  id?: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: { list_reply?: { id: string; title?: string } };
  order?: { catalog_id?: string; product_items?: OrderProductItem[] };
  referredProductId?: string;
}

@Injectable()
export class BotEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
    private readonly botSettings: BotSettingsService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryCheck: DeliveryCheckService,
  ) {}

  // Returns whether a message was actually processed (false for a missing
  // message or a webhook retry of one already handled) so the webhook
  // controller can skip its own post-processing (the push notification
  // lookup) on a duplicate too.
  async handleIncomingMessage(payload: any): Promise<boolean> {
    const message = this.extractMessage(payload);
    if (!message) return false;

    if (message.id && (await this.isDuplicateMessage(message.id))) {
      return false;
    }

    const { conversation, isNew } = await this.resolveConversation(
      message.from,
      !!message.referredProductId,
    );

    // Catalog orders get a bot reply unconditionally — even with the bot
    // disabled or the conversation already handed off to a human — since
    // the confirmation is about the order, not the general chat flow.
    if (message.type === 'order') {
      const settings = await this.botSettings.get();
      await this.handleOrderMessage(conversation, settings, message.order);
      return true;
    }

    // A reply to the delivery-location sub-flow is persisted by
    // DeliveryCheckService itself, annotated with the resolved bairro
    // (e.g. "22211-200 (Catete)") instead of the raw CEP text.
    const isDeliveryReply =
      conversation.awaitingDeliveryReply &&
      !!message.text?.body &&
      normalizeText(message.text.body) !== 'menu';

    if (message.text?.body && !isDeliveryReply) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'inbound',
          body: message.text.body,
        },
      });
    }

    const listReplyTitle = message.interactive?.list_reply?.title;
    if (listReplyTitle) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'inbound',
          body: listReplyTitle,
        },
      });
    }

    if (message.text?.body && normalizeText(message.text.body) === 'menu') {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'bot_active',
          invalidAttempts: 0,
          awaitingDeliveryReply: false,
          awaitingMenuItemAnswerId: null,
        },
      });
      await this.showMenu(conversation);
      return true;
    }

    // The delivery-location sub-flow (however it started — order, menu
    // item, or catalog referral) is a short closed loop that always ends
    // in a human handoff, so a reply keeps it moving regardless of the
    // bot's enabled/paused state — otherwise the customer's answer to
    // "qual seu CEP?" would go unanswered.
    if (conversation.awaitingDeliveryReply && message.text?.body) {
      await this.deliveryCheck.handleReply(conversation, message.text.body);
      return true;
    }

    if (conversation.status === 'paused_human') {
      const isStale = Date.now() - conversation.updatedAt.getTime() > STALE_HANDOFF_MS;
      if (!isStale) {
        return true;
      }
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'bot_active',
          invalidAttempts: 0,
          awaitingDeliveryReply: false,
          awaitingMenuItemAnswerId: null,
        },
      });
      return true;
    }

    const settings = await this.botSettings.get();
    if (!settings.botEnabled) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'paused_human' },
      });
      return true;
    }

    // 'image' is deliberately left out of the invalid-content bucket below —
    // ignored entirely for now, a dedicated image flow comes later.
    if (message.type === 'image') {
      return true;
    }

    if (message.type && message.type !== 'text' && message.type !== 'interactive') {
      await this.handleUnsupportedMessage(conversation, settings);
      return true;
    }

    if (conversation.awaitingMenuItemAnswerId && message.text?.body) {
      await this.handleMenuItemAnswerReply(conversation, message.text.body);
      return true;
    }

    if (message.referredProductId) {
      await this.deliveryCheck.start(conversation);
      return true;
    }

    if (isNew) {
      await this.showMenu(conversation);
      return true;
    }

    const selectedItemId = message.interactive?.list_reply?.id;
    await this.handleMenuSelection(conversation, selectedItemId);
    return true;
  }

  private async isDuplicateMessage(whatsappMessageId: string): Promise<boolean> {
    try {
      await this.prisma.processedWebhookMessage.create({ data: { whatsappMessageId } });
      return false;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return true;
      throw error;
    }
  }

  private extractMessage(payload: any): IncomingMessage | null {
    const raw = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!raw) return null;
    return {
      id: raw.id,
      from: raw.from,
      type: raw.type,
      text: raw.text,
      interactive: raw.interactive,
      order: raw.order,
      referredProductId: raw.context?.referred_product?.product_retailer_id,
    };
  }

  // Unlike every other terminal branch in this method, this one does NOT
  // hand off to a human — the bot replies and the conversation stays
  // exactly as it was (still bot_active, still awaiting whatever it was
  // awaiting), so the customer's next real message is handled normally.
  private async handleUnsupportedMessage(
    conversation: { id: string; phone: string },
    settings: { mediaReceivedMessage: string },
  ) {
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        kind: 'invalid_content',
        body: INVALID_CONTENT_LABEL,
      },
    });
    await this.whatsapp.sendText(conversation.phone, settings.mediaReceivedMessage);
    await this.prisma.message.create({
      data: { conversationId: conversation.id, direction: 'outbound', body: settings.mediaReceivedMessage },
    });
  }

  private async handleOrderMessage(
    conversation: { id: string; phone: string },
    settings: { orderReceivedMessage: string },
    order: { catalog_id?: string; product_items?: OrderProductItem[] } | undefined,
  ) {
    const items = order?.product_items ?? [];
    const productNames = order?.catalog_id
      ? await this.whatsapp.getProductNames(
          order.catalog_id,
          items.map((item) => item.product_retailer_id),
        )
      : {};

    await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId: conversation.id, direction: 'inbound', kind: 'order' },
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
    await this.whatsapp.sendText(conversation.phone, settings.orderReceivedMessage);
    await this.prisma.message.create({
      data: { conversationId: conversation.id, direction: 'outbound', body: settings.orderReceivedMessage },
    });

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
    const items = (await this.menuItems.list()).filter(
      (item) => item.active,
    );

    await this.whatsapp.sendText(conversation.phone, settings.welcomeMessage);
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        body: settings.welcomeMessage,
      },
    });

    await this.whatsapp.sendInteractiveList(
      conversation.phone,
      MENU_PROMPT,
      'Ver opções',
      items.map((item) => ({ id: item.id, title: item.topic })),
    );
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        body: [MENU_PROMPT, ...items.map((item) => `- ${item.topic}`)].join(
          '\n',
        ),
      },
    });
  }

  private async handleMenuSelection(
    conversation: { id: string; phone: string; invalidAttempts: number },
    selectedItemId: string | undefined,
  ) {
    const items = await this.menuItems.list();
    const selected = items.find(
      (item) => item.id === selectedItemId && item.active,
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

    switch (selected.type) {
      case 'texto':
        await this.whatsapp.sendText(conversation.phone, selected.reply ?? '');
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'outbound',
            body: selected.reply ?? '',
          },
        });
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'paused_human' },
        });
        break;
      case 'entrega':
        await this.deliveryCheck.start(conversation);
        break;
      case 'atendente':
        if (selected.reply) {
          await this.whatsapp.sendText(conversation.phone, selected.reply);
          await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              direction: 'outbound',
              body: selected.reply,
            },
          });
        }
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'paused_human' },
        });
        break;
      case 'pergunta':
        await this.whatsapp.sendText(conversation.phone, selected.question ?? '');
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'outbound',
            body: selected.question ?? '',
          },
        });
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { awaitingMenuItemAnswerId: selected.id },
        });
        break;
    }
  }

  private async handleMenuItemAnswerReply(
    conversation: { id: string; phone: string; awaitingMenuItemAnswerId: string | null },
    text: string,
  ) {
    const item = conversation.awaitingMenuItemAnswerId
      ? await this.menuItems.findOne(conversation.awaitingMenuItemAnswerId)
      : null;
    const normalizedInput = normalizeText(text);
    const match = item?.answerOptions?.find((option: { keywords: string[] }) =>
      option.keywords.some((keyword) => normalizedInput.includes(normalizeText(keyword))),
    );

    const replyText = match?.reply ?? item?.noMatchReply ?? DEFAULT_NO_MATCH_REPLY;
    await this.whatsapp.sendText(conversation.phone, replyText);
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        body: replyText,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { awaitingMenuItemAnswerId: null, status: 'paused_human' },
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
      await this.whatsapp.sendText(conversation.phone, settings.invalidAttemptsExceededMessage);
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          body: settings.invalidAttemptsExceededMessage,
        },
      });
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
