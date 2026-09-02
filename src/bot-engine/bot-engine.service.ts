import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryCheckService } from './delivery-check.service';

const MAX_INVALID_ATTEMPTS = 3;

interface IncomingMessage {
  from: string;
  type: 'text' | 'interactive';
  text?: { body: string };
  interactive?: { list_reply?: { id: string } };
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

    if (conversation.status === 'paused_human') {
      return;
    }

    if (conversation.awaitingDeliveryReply && message.text?.body) {
      await this.deliveryCheck.handleReply(conversation, message.text.body);
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
      'Como posso te ajudar hoje?',
      'Ver opções',
      items.map((item) => ({ id: item.id, title: item.topic })),
    );
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
        break;
      case 'entrega':
        await this.deliveryCheck.start(conversation);
        break;
      case 'atendente':
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'paused_human' },
        });
        break;
    }
  }

  private async registerInvalidAttempt(conversation: {
    id: string;
    phone: string;
    invalidAttempts: number;
  }) {
    const attempts = conversation.invalidAttempts + 1;

    if (attempts >= MAX_INVALID_ATTEMPTS) {
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
