import { Module } from '@nestjs/common';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { EmailModule } from '../email/email.module';
import { AlertsService } from './alerts.service';
import { AlertOnErrorInterceptor } from './alert-on-error.interceptor';

@Module({
  imports: [PushNotificationsModule, EmailModule],
  providers: [AlertsService, AlertOnErrorInterceptor],
  exports: [AlertsService, AlertOnErrorInterceptor],
})
export class AlertsModule {}
