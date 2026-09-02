import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { BotSettingsService } from './bot-settings.service';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';

@Controller('bot-settings')
@UseGuards(ClerkAuthGuard)
export class BotSettingsController {
  constructor(private readonly service: BotSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body() dto: UpdateBotSettingsDto) {
    return this.service.update(dto);
  }
}
