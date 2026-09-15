import { Injectable, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';

interface NotifiableConversation {
  id: string;
  name: string | null;
  phone: string;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  onModuleInit() {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
  }

  async notifyNewMessage(conversation: NotifiableConversation): Promise<void> {
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
          }
        }
      }),
    );
  }
}
