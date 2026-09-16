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
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
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
    });
  }
}
