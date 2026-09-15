import { Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushSubscriptionsModule } from '../push-subscriptions/push-subscriptions.module';

@Module({
  imports: [PushSubscriptionsModule],
  providers: [PushNotificationsService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
