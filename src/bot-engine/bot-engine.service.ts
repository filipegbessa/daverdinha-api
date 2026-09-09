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

interface IncomingMessage {
  from: string;
  type: 'text' | 'interactive';
  text?: { body: string };
  interactive?: { list_reply?: { id: string; title?: string } };
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

  async handleIncomingMessage(payload: any): Promise<void> {
    const message = this.extractMessage(payload);
    if (!message) return;

    const { conversation, isNew } = await this.resolveConversation(
      message.from,
      !!message.referredProductId,
    );

    if (message.text?.body) {
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
      return;
    }

    if (conversation.status === 'paused_human') {
      const isStale = Date.now() - conversation.updatedAt.getTime() > STALE_HANDOFF_MS;
      if (!isStale) {
        return;
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
      return;
    }

    const settings = await this.botSettings.get();
    if (!settings.botEnabled) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'paused_human' },
      });
      return;
    }

    if (conversation.awaitingDeliveryReply && message.text?.body) {
      await this.deliveryCheck.handleReply(conversation, message.text.body);
      return;
    }

    if (conversation.awaitingMenuItemAnswerId && message.text?.body) {
      await this.handleMenuItemAnswerReply(conversation, message.text.body);
      return;
    }

    if (message.referredProductId) {
      await this.deliveryCheck.start(conversation);
      return;
    }

    if (isNew) {
      await this.showMenu(conversation);
      return;
    }

    const selectedItemId = message.interactive?.list_reply?.id;
    await this.handleMenuSelection(conversation, selectedItemId);
  }

  private extractMessage(payload: any): IncomingMessage | null {
    const raw = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!raw) return null;
    return {
      from: raw.from,
      type: raw.type,
      text: raw.text,
      interactive: raw.interactive,
      referredProductId: raw.context?.referred_product?.product_retailer_id,
    };
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

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { invalidAttempts: 0 },
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
