import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  HeroSlidesService,
  type UploadedSlideImage,
} from './hero-slides.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';
import { ReorderHeroSlidesDto } from './dto/reorder-hero-slides.dto';

// Mesmo teto e mesmos tipos das fotos do catálogo.
const imageInterceptor = FileInterceptor('image', {
  limits: { fileSize: SITE_IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

const optionalText = (description?: string) => ({
  type: 'string',
  nullable: true,
  ...(description && { description }),
});

// O plugin do Swagger não enxerga o `FileInterceptor`.
const slideFormSchema = (required: string[], update = false) => ({
  schema: {
    type: 'object',
    required,
    properties: {
      eyebrow: optionalText('Linha pequena acima do título (até 60).'),
      title: { type: 'string', description: 'Até 80 caracteres.' },
      description: optionalText('Até 200 caracteres.'),
      linkLabel: optionalText('Texto do botão principal (até 30).'),
      linkUrl: optionalText('"/caminho" do site ou "https://...".'),
      whatsappLabel: optionalText('Padrão: "Falar no WhatsApp".'),
      whatsappMessage: optionalText('Sem mensagem, não há botão do WhatsApp.'),
      active: { type: 'boolean' },
      startsAt: { type: 'string', format: 'date-time', nullable: true },
      endsAt: { type: 'string', format: 'date-time', nullable: true },
      ...(update && {
        removeImage: {
          type: 'boolean',
          description: 'Apaga a imagem atual sem mandar outra.',
        },
      }),
      image: {
        type: 'string',
        format: 'binary',
        description: `JPEG, PNG ou WebP, até ${formatMegabytes(SITE_IMAGE_MAX_BYTES)}. No PATCH, substitui a atual.`,
      },
    },
  },
});

/** Destaques no admin. `reorder` vem antes de `:id`: a ordem decide o match. */
@ApiTags('hero-slides')
@ApiBearerAuth()
@Controller('hero-slides')
@UseGuards(ClerkAuthGuard)
export class HeroSlidesController {
  constructor(private readonly service: HeroSlidesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody(slideFormSchema(['title']))
  @UseInterceptors(imageInterceptor)
  create(
    @Body() dto: CreateHeroSlideDto,
    @UploadedFile() file?: UploadedSlideImage,
  ) {
    return this.service.create(dto, file);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderHeroSlidesDto) {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody(slideFormSchema([], true))
  @UseInterceptors(imageInterceptor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHeroSlideDto,
    @UploadedFile() file?: UploadedSlideImage,
  ) {
    return this.service.update(id, dto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
