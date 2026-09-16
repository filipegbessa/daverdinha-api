import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifySignature } from './verify-signature';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { ConversationNotifierService } from '../push-notifications/conversation-notifier.service';

@Controller('webhook/whatsapp')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly botEngine: BotEngineService,
    private readonly notifier: ConversationNotifierService,
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

    const result = await this.botEngine.handleIncomingMessage(body);

    // A failed push must never fail the webhook: Meta retries anything we
    // don't ack with a 200, and a retry would replay the whole message.
    if (result) {
      try {
        await this.notifier.notifyNewInboundMessage(result.conversationId);
      } catch (error) {
        this.logger.warn(`Failed to send new-message notification: ${error}`);
      }
    }

    return { status: 'ok' };
  }
}
