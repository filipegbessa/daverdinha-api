import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';

@ApiTags('push-subscriptions')
@ApiBearerAuth()
@Controller('push-subscriptions')
@UseGuards(ClerkAuthGuard)
export class PushSubscriptionsController {
  constructor(private readonly service: PushSubscriptionsService) {}

  @Post()
  save(@Req() req: AuthenticatedRequest, @Body() dto: SavePushSubscriptionDto) {
    return this.service.save(req.auth.sub, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Body() dto: RemovePushSubscriptionDto) {
    return this.service.remove(dto.endpoint);
  }
}
