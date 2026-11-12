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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { SITE_IMAGE_MAX_BYTES, formatMegabytes } from '../common/uploads';
import { imageFileFilter } from '../products/products.controller';
import { EventsService, type UploadedCover } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';

// Mesmo teto e mesmos tipos das fotos do catálogo: o Multer corta a leitura
// ao cruzar o limite, e o tipo errado é recusado antes de subir pro Blob.
const coverInterceptor = FileInterceptor('image', {
  limits: { fileSize: SITE_IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

// O plugin do Swagger não enxerga o `FileInterceptor`.
const eventFormSchema = (required: string[], update = false) => ({
  schema: {
    type: 'object',
    required,
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
      locationName: {
        type: 'string',
        nullable: true,
        description: 'Vazio = no ateliê.',
      },
      locationAddress: { type: 'string', nullable: true },
      price: {
        type: 'number',
        nullable: true,
        example: 120,
        description: 'Vazio = gratuito.',
      },
      spots: {
        type: 'integer',
        minimum: 1,
        nullable: true,
        description: 'Vazio = sem limite divulgado.',
      },
      ctaUrl: {
        type: 'string',
        format: 'uri',
        nullable: true,
        description: 'Link de inscrição externo. Vazio = WhatsApp.',
      },
      published: { type: 'boolean' },
      ...(update && {
        removeImage: {
          type: 'boolean',
          description: 'Apaga a capa atual sem mandar outra.',
        },
      }),
      image: {
        type: 'string',
        format: 'binary',
        description: `Capa (JPEG, PNG ou WebP, até ${formatMegabytes(SITE_IMAGE_MAX_BYTES)}). No PATCH, substitui a atual.`,
      },
    },
  },
});

/**
 * Agenda no admin. Sem `GET /events/:id`, de propósito: colidiria com o
 * público `GET /events/:slug`, e a lista já traz o evento inteiro pro dialog
 * de edição.
 */
@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(ClerkAuthGuard)
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get()
  list(@Query() query: ListEventsDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody(eventFormSchema(['title', 'description', 'startsAt', 'endsAt']))
  @UseInterceptors(coverInterceptor)
  create(@Body() dto: CreateEventDto, @UploadedFile() file?: UploadedCover) {
    return this.service.create(dto, file);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody(eventFormSchema([], true))
  @UseInterceptors(coverInterceptor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @UploadedFile() file?: UploadedCover,
  ) {
    return this.service.update(id, dto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
