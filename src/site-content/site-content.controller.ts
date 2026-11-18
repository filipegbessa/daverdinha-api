import {
  Body,
  Controller,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { SITE_IMAGE_MAX_BYTES, formatMegabytes } from '../common/uploads';
import { imageFileFilter } from '../products/products.controller';
import {
  SiteContentService,
  type UploadedAboutImage,
} from './site-content.service';
import { UpdateAboutDto } from './dto/update-about.dto';

const imageInterceptor = FileInterceptor('image', {
  limits: { fileSize: SITE_IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

/** O "Sobre" no admin. A leitura é a pública, `GET /site-content/about`. */
@ApiTags('site-content')
@ApiBearerAuth()
@Controller('site-content')
@UseGuards(ClerkAuthGuard)
export class SiteContentController {
  constructor(private readonly service: SiteContentService) {}

  @Put('about')
  @ApiConsumes('multipart/form-data')
  // O plugin do Swagger não enxerga o `FileInterceptor`.
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'text'],
      properties: {
        title: { type: 'string', description: 'Até 100 caracteres.' },
        text: {
          type: 'string',
          description: 'Parágrafos separados por linha em branco.',
        },
        instagramLabel: {
          type: 'string',
          nullable: true,
          description: 'Vazio = sem link pro Instagram.',
        },
        removeImage: { type: 'boolean' },
        image: {
          type: 'string',
          format: 'binary',
          description: `JPEG, PNG ou WebP, até ${formatMegabytes(SITE_IMAGE_MAX_BYTES)}.`,
        },
      },
    },
  })
  @UseInterceptors(imageInterceptor)
  updateAbout(
    @Body() dto: UpdateAboutDto,
    @UploadedFile() file?: UploadedAboutImage,
  ) {
    return this.service.updateAbout(dto, file);
  }
}
