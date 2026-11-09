import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoreSettingsService } from './store-settings.service';

/**
 * Separado do controller do admin pra "esta rota é pública" ser um fato da
 * estrutura, não um decorator faltando. Só expõe o parcelamento, que o site
 * mostra na página do produto.
 */
@ApiTags('store-settings')
@Controller('store-settings')
export class PublicStoreSettingsController {
  constructor(private readonly service: StoreSettingsService) {}

  @Get('public')
  getPublic() {
    return this.service.getPublic();
  }
}
