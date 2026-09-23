import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryCheckService } from './delivery-check.service';
import {
  MediaStorageService,
  buildMediaKey,
} from '../media/media-storage.service';
import { normalizeText } from '../common/normalize-text';
import {
  parseIncomingMessage,
  type IncomingMessage,
  type OrderProductItem,
} from '../whatsapp/incoming-message';

const MAX_INVALID_ATTEMPTS = 3;
const MENU_PROMPT = 'Como posso te ajudar hoje?';
const MENU_BUTTON = 'Ver opções';
const STALE_HANDOFF_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Teto de armazenamento de mídia (Tarefa 11), 2 GB abaixo dos 10 GB
 * gratuitos do R2 — folga para o excedente de checar-antes-de-agir (o
 * total só é conferido antes do download, nunca durante) e para o custo
 * ficar perto de zero mesmo passando um pouco do teto.
 */
const MEDIA_STORAGE_CAP_BYTES = 8n * 1024n * 1024n * 1024n;

/**
 * Teto por conversa (Tarefa 11, item opcional do plano): sem ele, uma única
 * conversa poderia consumir sozinha o teto global e desligar o recurso para
 * todos os outros clientes. Janela móvel de 24h, não dia calendário — um
 * reset à meia-noite seria fácil de burlar. 20 imagens/dia a 5 MB (o teto de
 * cada uma) são ~100 MB — folgado para uso legítimo (fotos de produto,
 * comprovante), e ainda assim uma fração pequena dos 8 GB totais.
 */
const MAX_IMAGES_PER_CONVERSATION_PER_DAY = 20;
const CONVERSATION_IMAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Typing "menu" is the customer's escape hatch out of any sub-flow, so it's
// matched before anything else looks at the text.
const MENU_KEYWORD = 'menu';

// Persisted as a stand-in for the actual content on any message type the bot
// can't interpret (audio/sticker/video/document/etc — we never download or
// store that media). Image is handled separately — see processImageMessage —
// but a photo the download rejects (bad type, too large) lands here too.
const INVALID_CONTENT_LABEL = '[Conteúdo inválido]';

/**
 * Anything that is neither plain text, a tap on the menu, nor an image
 * (which has its own download-and-record path). A catalog `order` never
 * reaches this check — it returns earlier, through its own flow.
 */
function isUnsupportedContent(type: string | undefined): boolean {
  return (
    !!type && type !== 'text' && type !== 'interactive' && type !== 'image'
  );
}

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
  private readonly logger = new Logger(BotEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
    private readonly messenger: ConversationMessengerService,
    private readonly botSettings: BotSettingsService,
    private readonly menuItems: MenuItemsService,
    private readonly deliveryCheck: DeliveryCheckService,
    private readonly mediaStorage: MediaStorageService,
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

    try {
      return await this.processMessage(message);
    } catch (error) {
      // A reivindicação do wamid é o que faz uma reentrega simultânea virar
      // no-op — por isso ela vem antes de processar. Só que mantê-la depois de
      // uma falha transforma a reentrega da Meta num descarte silencioso: a
      // mensagem do cliente some sem deixar rastro. Devolvendo a reivindicação,
      // a reentrega volta a ser uma nova chance.
      if (message.id) {
        // Um erro aqui não pode mascarar o que de fato quebrou.
        await this.prisma.processedWebhookMessage
          .delete({ where: { whatsappMessageId: message.id } })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private async processMessage(
    message: IncomingMessage,
  ): Promise<HandledMessage | null> {
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

    // Image is content, not something the bot can't read — it gets its own
    // download-and-record path (including the CEP-wait special case) rather
    // than falling into the generic text/unsupported-content branches below.
    if (message.type === 'image' && message.image) {
      return this.processImageMessage(conversation, isNew, message, handled);
    }

    const text = message.text?.body;
    const isMenuKeyword = !!text && normalizeText(text) === MENU_KEYWORD;

    // A reply to the delivery-location sub-flow is persisted by
    // DeliveryCheckService itself, annotated with the resolved bairro
    // (e.g. "22211-200 (Catete)") instead of the raw CEP text.
    const isDeliveryReply =
      conversation.awaitingDeliveryReply && !!text && !isMenuKeyword;

    if (text && !isDeliveryReply) {
      await this.messenger.recordInbound(conversation.id, text, undefined, {
        whatsappMessageId: message.id,
        repliedToWamid: message.repliedToWamid,
      });
    }

    const listReplyId = message.interactive?.list_reply?.id;
    const listReplyTitle = message.interactive?.list_reply?.title;
    if (listReplyTitle) {
      await this.messenger.recordInbound(
        conversation.id,
        listReplyTitle,
        undefined,
        {
          whatsappMessageId: message.id,
          repliedToWamid: message.repliedToWamid,
        },
      );
    }

    if (isMenuKeyword) {
      await this.resetToBot(conversation.id);
      await this.showMenu(conversation);
      return handled;
    }

    // Tapping a menu item always gets a reply, whatever the conversation's
    // status — same principle as the order confirmation and unsupported
    // media above: the reply is about the tap, not about who owns the chat.
    // Without this, the *first* selection replies fine (still bot_active),
    // hands off to paused_human, and every tap after that on the same list
    // — the customer picking a different option — went silent, since
    // continueBotFlow's paused_human check short-circuits before ever
    // reaching handleMenuSelection. `botEnabled` is still the master
    // switch: with it off, a tap is recorded above but nothing is sent,
    // same as everywhere else the bot stays silent on purpose.
    if (listReplyId) {
      const settings = await this.botSettings.get();
      if (settings.botEnabled) {
        await this.handleMenuSelection(conversation, listReplyId);
      }
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

    // Content the bot can't read is answered on the bot's own trigger,
    // whatever the conversation's status — the same principle a catalog order
    // already follows: the reply is about the message, not about who owns the
    // chat. This check sits *above* the `paused_human` return on purpose.
    // Below it, a photo sent to a conversation a human was handling fell
    // through without being recorded at all: the operator's transcript had
    // nothing where the photo was, and the push the webhook fires right after
    // previewed whatever the previous message in the thread happened to be —
    // often days old.
    if (isUnsupportedContent(message.type)) {
      const settings = await this.botSettings.get();
      await this.handleUnsupportedMessage(
        conversation,
        settings,
        settings.botEnabled,
        message.id,
        message.repliedToWamid,
      );
      return handled;
    }

    return this.continueBotFlow(conversation, isNew, message, handled);
  }

  /**
   * The shared tail once a message turns out to be neither an order, a menu
   * reset, a delivery-CEP reply, nor content the bot can't read: hand off
   * checks, then either start the delivery sub-flow, greet a new customer,
   * or treat whatever's left as a menu selection. Text/interactive messages
   * reach this after `processMessage` records them; a successfully
   * downloaded image reaches it from `processImageMessage`, already
   * recorded the same way — from here on the two are indistinguishable.
   */
  private async continueBotFlow(
    conversation: {
      id: string;
      phone: string;
      status: string;
      invalidAttempts: number;
      updatedAt: Date;
    },
    isNew: boolean,
    message: IncomingMessage,
    handled: HandledMessage,
  ): Promise<HandledMessage> {
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

  /**
   * Downloads the photo from Meta, uploads it to R2, and records it as a
   * normal inbound message with the media columns filled in. A definitive
   * download failure (bad type, too large) is content the bot can't read,
   * same as any other unsupported media — it gets the same invalid-content
   * treatment `isUnsupportedContent` gives audio/video/etc. A transient
   * failure (network, 5xx, timeout) is not caught here: it propagates to
   * `handleIncomingMessage`, which releases the wamid claim so Meta's
   * redelivery is a fresh attempt at the same photo — swallowing it would
   * lose the photo over a network blip instead.
   */
  private async processImageMessage(
    conversation: {
      id: string;
      phone: string;
      status: string;
      invalidAttempts: number;
      awaitingDeliveryReply: boolean;
      updatedAt: Date;
    },
    isNew: boolean,
    message: IncomingMessage,
    handled: HandledMessage,
  ): Promise<HandledMessage> {
    const image = message.image!;
    const settings = await this.botSettings.get();

    // Checked before spending anything on the Meta round trip: past the
    // cap, the acervo simply stops growing — no purge, no exception, the
    // same invalid-content path a photo the bot can't read already uses.
    if (settings.mediaBytesUsed >= MEDIA_STORAGE_CAP_BYTES) {
      await this.handleUnsupportedMessage(
        conversation,
        settings,
        settings.botEnabled,
        message.id,
        message.repliedToWamid,
      );
      return handled;
    }

    // Corta o vetor na origem: sem isto, uma única conversa em enxurrada (ou
    // travada num laço de reenvio) poderia sozinha consumir o teto global e
    // desligar o recebimento de imagem para todo mundo.
    const recentImages = await this.prisma.message.count({
      where: {
        conversationId: conversation.id,
        kind: 'image',
        direction: 'inbound',
        createdAt: {
          gte: new Date(Date.now() - CONVERSATION_IMAGE_WINDOW_MS),
        },
      },
    });
    if (recentImages >= MAX_IMAGES_PER_CONVERSATION_PER_DAY) {
      await this.handleUnsupportedMessage(
        conversation,
        settings,
        settings.botEnabled,
        message.id,
        message.repliedToWamid,
      );
      return handled;
    }

    // Os dois tempos medidos separados, e não o total: o desenho inteiro
    // depende de o ida-e-volta caber no webhook, e somados eles não dizem
    // qual dos dois lados é o gargalo. Sem isto, uma foto real chega,
    // funciona e não deixa medição nenhuma para trás.
    const startedAt = Date.now();
    const download = await this.whatsapp.downloadMedia(image.id);
    const downloadMs = Date.now() - startedAt;

    if (!download.ok) {
      await this.handleUnsupportedMessage(
        conversation,
        settings,
        settings.botEnabled,
        message.id,
        message.repliedToWamid,
      );
      return handled;
    }

    const mediaKey = buildMediaKey(conversation.id, download.mimeType);
    const uploadStartedAt = Date.now();
    await this.mediaStorage.put(mediaKey, download.buffer, download.mimeType);

    // Só números e o tipo. Nada de telefone, legenda ou chave do arquivo:
    // log de plataforma é lido por quem não precisa ver conteúdo de cliente.
    this.logger.log(
      `inbound image stored: download=${downloadMs}ms ` +
        `upload=${Date.now() - uploadStartedAt}ms ` +
        `bytes=${download.sizeBytes} type=${download.mimeType}`,
    );

    // The caption is content, never a command — it lands in `body` for the
    // operator to read, but it plays no part in any decision below. Keeping
    // it out of the CEP-wait check (which looks at `text`, not the caption)
    // is what stops a captioned "menu" from restarting the conversation.
    await this.messenger.recordInbound(
      conversation.id,
      image.caption ?? null,
      'image',
      {
        whatsappMessageId: message.id,
        repliedToWamid: message.repliedToWamid,
        mediaKey,
        mediaMimeType: download.mimeType,
        mediaSizeBytes: download.sizeBytes,
      },
    );

    // Same effect as an unreadable CEP today: retry once, then hand off.
    // DeliveryCheckService.handleReply can't be reused here — it records
    // the reply itself, as text, and the image is already recorded above.
    if (conversation.awaitingDeliveryReply) {
      await this.deliveryCheck.registerUnresolvedAttempt(conversation);
      return handled;
    }

    return this.continueBotFlow(conversation, isNew, message, handled);
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
  /**
   * The message is always recorded — losing it is how the operator ends up
   * reading a conversation with a hole in it. Only the reply is conditional:
   * `botEnabled` is the shop's master switch, and with it off the bot stays
   * silent even on its own trigger.
   */
  private async handleUnsupportedMessage(
    conversation: { id: string; phone: string },
    settings: { mediaReceivedMessage: string },
    reply: boolean,
    whatsappMessageId: string | undefined,
    repliedToWamid: string | undefined,
  ) {
    await this.messenger.recordInbound(
      conversation.id,
      INVALID_CONTENT_LABEL,
      'invalid_content',
      { whatsappMessageId, repliedToWamid },
    );
    if (reply) {
      await this.messenger.sendText(
        conversation,
        settings.mediaReceivedMessage,
      );
    }
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
