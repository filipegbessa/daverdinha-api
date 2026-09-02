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
import { BotEngineService } from '../bot-engine/bot-engine.service';

@Controller('webhook/whatsapp')
export class WebhookController {
  constructor(private readonly botEngine: BotEngineService) {}

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
    return { status: 'ok' };
  }
}
