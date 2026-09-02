import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WhatsAppClientService } from './whatsapp-client.service';
import { RawBodyMiddleware } from './raw-body.middleware';
import { BotEngineModule } from '../bot-engine/bot-engine.module';

@Module({
  imports: [BotEngineModule],
  controllers: [WebhookController],
  providers: [WhatsAppClientService],
  exports: [WhatsAppClientService],
})
export class WhatsAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({ path: 'webhook/whatsapp', method: RequestMethod.POST });
  }
}
