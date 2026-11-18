import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HeroSlidesService } from './hero-slides.service';

/** Os destaques no ar, pra home. Separado do admin: "é público" é estrutura. */
@ApiTags('hero-slides')
@Controller('hero-slides')
export class PublicHeroSlidesController {
  constructor(private readonly service: HeroSlidesService) {}

  @Get('active')
  listActive() {
    return this.service.listActive();
  }
}
