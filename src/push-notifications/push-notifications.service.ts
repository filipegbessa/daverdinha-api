import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';

interface NotifiableConversation {
  id: string;
  name: string | null;
  phone: string;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private vapidConfigured = false;

  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  onModuleInit() {
    const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
    if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    this.vapidConfigured = true;
  }

  async notifyNewMessage(conversation: NotifiableConversation): Promise<void> {
    if (!this.vapidConfigured) return;

    const subscriptions = await this.subscriptions.listAll();
    const payload = JSON.stringify({
      title: 'Nova mensagem',
      body: conversation.name ?? conversation.phone,
      url: `/admin/conversas/${conversation.id}`,
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
