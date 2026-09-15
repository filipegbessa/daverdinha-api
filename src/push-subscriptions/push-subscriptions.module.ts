import { Module } from '@nestjs/common';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [PushSubscriptionsService],
  controllers: [PushSubscriptionsController],
  exports: [PushSubscriptionsService],
})
export class PushSubscriptionsModule {}
