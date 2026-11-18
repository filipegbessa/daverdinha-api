import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SiteContentService } from './site-content.service';

/** O "Sobre" da home. Separado do admin: "é público" é estrutura. */
@ApiTags('site-content')
@Controller('site-content')
export class PublicSiteContentController {
  constructor(private readonly service: SiteContentService) {}

  @Get('about')
  getAbout() {
    return this.service.getAbout();
  }
}
