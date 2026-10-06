import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { OpenApiService } from './openapi.service';

/**
 * Só o JSON. Quem renderiza é a página `GET /docs` (ver docs-page.ts), que
 * busca este endpoint depois do login do Clerk. Ele usa o mesmo guard das
 * rotas do admin — o mapa da API não fica público.
 */
@ApiExcludeController()
@Controller('openapi.json')
@UseGuards(ClerkAuthGuard)
export class OpenApiController {
  constructor(private readonly openApi: OpenApiService) {}

  @Get()
  get() {
    return this.openApi.getDocument();
  }
}
