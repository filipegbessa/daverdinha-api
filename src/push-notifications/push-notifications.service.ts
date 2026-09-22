import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

const MAX_BODY_LENGTH = 120;

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
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      this.vapidConfigured = true;
    } catch (error) {
      this.logger.warn(`Invalid VAPID configuration, push notifications disabled: ${error}`);
    }
  }

  async notifyNewMessage(conversation: NotifiableConversation): Promise<void> {
    if (!this.vapidConfigured) return;

    const subscriptions = await this.subscriptions.listAll();
    const payload = JSON.stringify({
      title: conversation.name ?? formatPhone(conversation.phone),
      body: truncateBody(conversation.messagePreview),
      url: `/admin/conversas/${conversation.id}`,
      // Epoch millis, the shape `showNotification`'s `timestamp` option takes.
      // Left out when unknown (JSON.stringify drops an undefined value), and
      // the browser then falls back to the delivery time on its own.
      timestamp: conversation.sentAt?.getTime(),
    });

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
