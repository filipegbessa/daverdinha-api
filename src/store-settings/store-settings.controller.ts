import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { StoreSettingsService } from './store-settings.service';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

@ApiTags('store-settings')
@ApiBearerAuth()
@Controller('store-settings')
@UseGuards(ClerkAuthGuard)
export class StoreSettingsController {
  constructor(private readonly service: StoreSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body() dto: UpdateStoreSettingsDto) {
    return this.service.update(dto);
  }
}
