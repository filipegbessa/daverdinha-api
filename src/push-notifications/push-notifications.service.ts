import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as webpush from 'web-push';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';
import { formatPhone } from '../common/format-phone';

interface NotifiableConversation {
  id: string;
  name: string | null;
  phone: string;
  messagePreview: string;
  /**
   * When the customer's message was recorded. Sent so the notification can
   * carry its own clock: the Notification API stamps one with the moment it
   * was *delivered* otherwise, which reads as "now" for a message that has
   * been sitting in the queue — or that the push is merely reporting late.
   */
  sentAt?: Date;
}

interface NotifiableOrder {
  id: string;
  code: string;
  total: Prisma.Decimal | number;
  customerName: string;
  /** Pago depois de vencer ou de ser cancelado: a reserva já tinha sido solta. */
  late?: boolean;
  /** Só em pedido de ingresso: quantos participantes e de qual evento. */
  tickets?: { count: number; eventTitle: string };
}

const MAX_BODY_LENGTH = 120;

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function truncateBody(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_BODY_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_BODY_LENGTH).trimEnd()}…`;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private vapidConfigured = false;

  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  onModuleInit() {
    const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
    if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    try {
      webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
      this.vapidConfigured = true;
    } catch (error) {
      this.logger.warn(
        `Invalid VAPID configuration, push notifications disabled: ${error}`,
      );
    }
  }

  async notifyNewMessage(conversation: NotifiableConversation): Promise<void> {
    await this.sendToAll({
      title: conversation.name ?? formatPhone(conversation.phone),
      body: truncateBody(conversation.messagePreview),
      url: `/admin/conversas/${conversation.id}`,
      // Epoch millis, the shape `showNotification`'s `timestamp` option takes.
      // Left out when unknown (JSON.stringify drops an undefined value), and
      // the browser then falls back to the delivery time on its own.
      timestamp: conversation.sentAt?.getTime(),
    });
  }

  /** Venda paga no site. Pedido criado e abandonado não avisa: é ruído. */
  async notifyNewOrder(order: NotifiableOrder): Promise<void> {
    const amount = new Prisma.Decimal(order.total);
    const { tickets } = order;
    // Ingresso: "Ingresso vendido" (pago) ou "Nova inscrição" (gratuito), com
    // o evento no lugar do valor.
    const title = !tickets
      ? `Novo pedido ${order.code}`
      : amount.isZero()
        ? `Nova inscrição ${order.code}`
        : `Ingresso vendido ${order.code}`;
    const body = tickets
      ? `${order.customerName} · ${tickets.count} ${tickets.count === 1 ? 'ingresso' : 'ingressos'} · ${tickets.eventTitle}`
      : `${order.customerName} · ${brl.format(amount.toNumber())}`;
    const warning = tickets ? 'confira as vagas' : 'confira o estoque';
    await this.sendToAll({
      title,
      body: truncateBody(
        order.late ? `⚠️ Pago depois de vencer, ${warning}. ${body}` : body,
      ),
      url: `/admin/pedidos/${order.id}`,
    });
  }

  private async sendToAll(notification: {
    title: string;
    body: string;
    url: string;
    timestamp?: number;
  }): Promise<void> {
    if (!this.vapidConfigured) return;

    const subscriptions = await this.subscriptions.listAll();
    const payload = JSON.stringify(notification);

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptions.remove(subscription.endpoint);
          } else {
            this.logger.warn(
              `Failed to send push notification to ${subscription.endpoint}: ${statusCode ?? error}`,
            );
          }
        }
      }),
    );
  }
}
