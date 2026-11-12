import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoreSettingsService } from './store-settings.service';

/**
 * Separado do controller do admin pra "esta rota é pública" ser um fato da
 * estrutura, não um decorator faltando. Expõe os interruptores do site e da
 * loja (o site decide por eles o que mostrar) e o parcelamento.
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
