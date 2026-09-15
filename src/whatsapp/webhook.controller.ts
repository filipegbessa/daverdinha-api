import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifySignature } from './verify-signature';
import { extractPhoneFromWebhookPayload } from './extract-phone';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Controller('webhook/whatsapp')
export class WebhookController {
  constructor(
    private readonly botEngine: BotEngineService,
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (
      mode === 'subscribe' &&
      verifyToken === process.env.WHATSAPP_VERIFY_TOKEN
    ) {
      return challenge;
    }
    throw new ForbiddenException('Verify token mismatch');
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request, @Body() body: unknown) {
    const rawBody: Buffer = (req as any).rawBody;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (
      !verifySignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET!)
    ) {
      throw new ForbiddenException('Invalid signature');
    }

    await this.botEngine.handleIncomingMessage(body);

    try {
      const phone = extractPhoneFromWebhookPayload(body);
      if (phone) {
        const conversation = await this.prisma.conversation.findFirst({ where: { phone } });
        if (conversation?.status === 'paused_human') {
          await this.pushNotifications.notifyNewMessage(conversation);
        }
      }
    } catch {
      // best-effort: never fail the webhook response over notification plumbing
    }

    return { status: 'ok' };
  }
}
