import {
  BadRequestException,
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
import { ProductsService, type UploadedPhoto } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import {
  IMAGE_MIME_TYPES,
  SITE_IMAGE_MAX_BYTES,
  formatMegabytes,
} from '../common/uploads';

export const MAX_IMAGES = 6;

/** Recusa o arquivo errado com 400 antes de qualquer upload pro Blob. */
export function imageFileFilter(
  _req: unknown,
  file: { mimetype: string },
  cb: (error: Error | null, accept: boolean) => void,
): void {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new BadRequestException('A foto precisa ser JPEG, PNG ou WebP.'), false);
}

// O teto de tamanho fica no Multer, que corta a leitura ao cruzar o limite
// (413): uma foto enorme nem chega a ocupar a memória da função.
const photosInterceptor = FilesInterceptor('images', MAX_IMAGES, {
  limits: { fileSize: SITE_IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

// O plugin do Swagger não enxerga o `FilesInterceptor`: sem isto a doc
// mostraria um body JSON e o "Try it" não teria onde anexar as fotos.
const productFormSchema = (required: string[]) => ({
  schema: {
    type: 'object',
    required,
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      price: { type: 'number', example: 89.9 },
      categoryId: { type: 'string', format: 'uuid' },
      order: { type: 'integer' },
      active: { type: 'boolean' },
      featured: {
        type: 'boolean',
        description:
          'Aparece na vitrine da home e nas listas das páginas internas.',
      },
      stock: {
        type: 'integer',
        minimum: 0,
        nullable: true,
        description:
          'Com número: pronta entrega (0 = esgotado). Vazio: sob encomenda.',
      },
      leadTimeDays: {
        type: 'integer',
        minimum: 1,
        maximum: 180,
        nullable: true,
        description:
          'Prazo de confecção em dias; obrigatório quando o produto é sob encomenda.',
      },
      images: {
        type: 'array',
        items: { type: 'string', format: 'binary' },
        description: `Até ${MAX_IMAGES} fotos (JPEG, PNG ou WebP, até ${formatMegabytes(SITE_IMAGE_MAX_BYTES)} cada). A primeira é a capa. No PATCH, mandar fotos substitui todas.`,
      },
    },
  },
});

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(ClerkAuthGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody(productFormSchema(['name', 'description', 'price', 'categoryId']))
  @UseInterceptors(photosInterceptor)
  create(
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: UploadedPhoto[] = [],
  ) {
    return this.service.create(dto, files);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody(productFormSchema([]))
  @UseInterceptors(photosInterceptor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
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
