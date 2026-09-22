import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

/**
 * Decides *whether* an inbound message deserves a push, and builds what the
 * operator will read on the lock screen. Kept apart from
 * PushNotificationsService, which only knows how to put bytes on the wire.
 */
@Injectable()
export class ConversationNotifierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  /**
   * Only conversations already handed off to a human are worth a push —
   * while the bot is answering, nobody needs to pick up their phone.
   */
  async notifyNewInboundMessage(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        // The newest *inbound* message, not the newest row: the push is about
        // what the customer sent. Taking the newest row previewed the bot's
        // own last reply whenever the flow answered before the push went out
        // (a catalog order ends on the CEP prompt, so the operator got a push
        // reading "qual seu CEP?"). `id` breaks the tie because the bot writes
        // two messages inside the same millisecond — the same reason `since`
        // has to be inclusive on the messages endpoint.
        messages: {
          where: { direction: 'inbound' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });

    if (conversation?.status !== 'paused_human') return;

    const [lastMessage] = conversation.messages;
    const messagePreview =
      lastMessage?.kind === 'order'
        ? 'Novo pedido pelo catálogo'
        : (lastMessage?.body ?? 'Nova mensagem');

    await this.pushNotifications.notifyNewMessage({
      id: conversation.id,
      name: conversation.name,
      phone: conversation.phone,
      messagePreview,
      sentAt: lastMessage?.createdAt,
    });
  }
}
