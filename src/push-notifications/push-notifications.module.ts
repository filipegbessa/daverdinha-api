import { Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { ConversationNotifierService } from './conversation-notifier.service';
import { PushSubscriptionsModule } from '../push-subscriptions/push-subscriptions.module';

@Module({
  imports: [PushSubscriptionsModule],
  providers: [PushNotificationsService, ConversationNotifierService],
  exports: [PushNotificationsService, ConversationNotifierService],
})
export class PushNotificationsModule {}
