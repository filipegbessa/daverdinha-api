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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { SITE_IMAGE_MAX_BYTES, formatMegabytes } from '../common/uploads';
import {
  imageFileFilter,
  MAX_IMAGES,
} from '../products/products.controller';
import { EventsService, type UploadedPhoto } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';

// Mesmo teto, mesmos tipos e mesma quantidade máxima das fotos do catálogo: o
// Multer corta a leitura ao cruzar o limite, e o tipo errado é recusado antes
// de subir pro Blob.
const photosInterceptor = FilesInterceptor('images', MAX_IMAGES, {
  limits: { fileSize: SITE_IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

// O plugin do Swagger não enxerga o `FilesInterceptor`.
const eventFormSchema = (required: string[]) => ({
  schema: {
    type: 'object',
    required,
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description:
          'Opcional. Sem fim, o evento sai da lista no fim do dia em que começa.',
      },
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
      published: { type: 'boolean' },
      ticketSales: {
        type: 'boolean',
        description:
          'Vende/inscreve pelo site (com o interruptor "Venda de ingressos" ligado).',
      },
      maxTicketsPerOrder: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        default: 10,
      },
      images: {
        type: 'array',
        items: { type: 'string', format: 'binary' },
        description: `Até ${MAX_IMAGES} fotos (JPEG, PNG ou WebP, até ${formatMegabytes(SITE_IMAGE_MAX_BYTES)} cada). A primeira é a capa. No PATCH, mandar fotos substitui todas.`,
      },
    },
  },
});

/**
 * Agenda no admin. O evento sozinho é `GET /events/:id/admin`, não
 * `GET /events/:id`: esse colidiria com o público `GET /events/:slug`,
 * registrado antes.
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

  /** A página de edição do evento no admin, com vagas vendidas e reservadas. */
  @Get(':id/admin')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody(eventFormSchema(['title', 'description', 'startsAt']))
  @UseInterceptors(photosInterceptor)
  create(
    @Body() dto: CreateEventDto,
    @UploadedFiles() files: UploadedPhoto[] = [],
  ) {
    return this.service.create(dto, files);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody(eventFormSchema([]))
  @UseInterceptors(photosInterceptor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @UploadedFiles() files: UploadedPhoto[] = [],
  ) {
    return this.service.update(id, dto, files);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
