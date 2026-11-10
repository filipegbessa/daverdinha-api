import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { BotSettingsService } from './bot-settings.service';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';

@ApiTags('bot-settings')
@ApiBearerAuth()
@Controller('bot-settings')
@UseGuards(ClerkAuthGuard)
export class BotSettingsController {
  constructor(private readonly service: BotSettingsService) {}

  @Get()
  get() {
    return this.service.getView();
  }

  @Patch()
  update(@Body() dto: UpdateBotSettingsDto) {
    return this.service.update(dto);
  }
}
