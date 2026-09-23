import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { BotSettingsService } from './bot-settings.service';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';

@Controller('bot-settings')
@UseGuards(ClerkAuthGuard)
export class BotSettingsController {
  constructor(private readonly service: BotSettingsService) {}

  @Get()
  async get() {
    return this.serialize(await this.service.get());
  }

  @Patch()
  async update(@Body() dto: UpdateBotSettingsDto) {
    return this.serialize(await this.service.update(dto));
  }

  /**
   * `mediaBytesUsed` is a Postgres `BigInt`, which `JSON.stringify` can't
   * serialize on its own. 8 GB in bytes is nowhere near
   * `Number.MAX_SAFE_INTEGER`, so converting for the wire is safe — the
   * `bigint` stays intact everywhere internal (BotEngineService's cap
   * check needs it), only the HTTP boundary converts.
   */
  private serialize<T extends { mediaBytesUsed: bigint }>(settings: T) {
    return { ...settings, mediaBytesUsed: Number(settings.mediaBytesUsed) };
  }
}
