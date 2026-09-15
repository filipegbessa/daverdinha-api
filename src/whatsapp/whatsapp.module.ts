import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { RawBodyMiddleware } from './raw-body.middleware';
import { BotEngineModule } from '../bot-engine/bot-engine.module';
import { WhatsAppClientModule } from './whatsapp-client.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [BotEngineModule, WhatsAppClientModule, PushNotificationsModule],
  controllers: [WebhookController],
})
export class WhatsAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({ path: 'webhook/whatsapp', method: RequestMethod.POST });
  }
}
