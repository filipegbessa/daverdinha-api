import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

/**
 * O que o operador lê na tela de bloqueio.
 *
 * Nem toda mensagem tem corpo para mostrar: pedido de catálogo não tem, e
 * imagem só tem quando o cliente escreveu legenda. Cair no `body` cru nesses
 * casos daria um "Nova mensagem" que não diz nada — o marcador diz **o que**
 * chegou, e a legenda, quando existe, diz o que o cliente escreveu.
 *
 * O truncamento em 120 caracteres é do `PushNotificationsService`, então
 * legenda longa não precisa de tratamento aqui.
 */
function buildPreview(
  message: { kind: string; body: string | null } | undefined,
): string {
  if (!message) return 'Nova mensagem';
  if (message.kind === 'order') return 'Novo pedido pelo catálogo';
  if (message.kind === 'image') {
    return message.body ? `📷 ${message.body}` : '📷 Foto';
  }
  return message.body ?? 'Nova mensagem';
}

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
    const messagePreview = buildPreview(lastMessage);

    await this.pushNotifications.notifyNewMessage({
      id: conversation.id,
      name: conversation.name,
      phone: conversation.phone,
      messagePreview,
      sentAt: lastMessage?.createdAt,
    });
  }
}
