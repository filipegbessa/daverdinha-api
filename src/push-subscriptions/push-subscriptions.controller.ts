import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';

@Controller('push-subscriptions')
@UseGuards(ClerkAuthGuard)
export class PushSubscriptionsController {
  constructor(private readonly service: PushSubscriptionsService) {}

  @Post()
  save(@Req() req: Request & { auth: { sub: string } }, @Body() dto: SavePushSubscriptionDto) {
    return this.service.save(req.auth.sub, dto);
  }

  @Delete()
  remove(@Body() dto: RemovePushSubscriptionDto) {
    return this.service.remove(dto.endpoint);
  }
}
