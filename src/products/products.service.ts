import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';
import { pageBounds, paginated } from '../common/pagination';
import { uniqueSlug } from '../common/slug';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/prisma-errors';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

/** O que o Multer entrega por foto — só o que o upload usa. */
export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
}

/** O contrato público, igual a `src/features/site/types/catalog.ts` no site. */
export interface ProductPublic {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: string[];
  category: { id: string; name: string; slug: string };
}

export interface ProductAdmin extends ProductPublic {
  categoryId: string;
  active: boolean;
  featured: boolean;
  order: number;
}

const WITH_CATEGORY = {
  category: { select: { id: true, name: true, slug: true } },
} as const;

const ORDER = [{ order: 'asc' as const }, { name: 'asc' as const }];

/** Produto ativo de categoria ativa: tirar a categoria do ar tira os produtos dela junto. */
const ACTIVE = { active: true, category: { active: true } } as const;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof WITH_CATEGORY }>;

/**
 * Único lugar que converte `price`: o `Decimal` do Prisma vira string no
 * JSON ("89.9"), e o site espera número. Toda leitura passa por aqui.
 */
function toAdmin(row: ProductRow): ProductAdmin {
  return {
    ...toPublic(row),
    categoryId: row.categoryId,
    active: row.active,
    featured: row.featured,
    order: row.order,
  };
}

function toPublic(row: ProductRow): ProductPublic {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: new Prisma.Decimal(row.price).toNumber(),
    images: row.images,
    category: row.category,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blob: BlobStorageService,
  ) {}

  async list(query: ListProductsDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const search = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.active !== undefined && { active: query.active }),
      ...(query.featured !== undefined && { featured: query.featured }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: WITH_CATEGORY,
        orderBy: ORDER,
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(rows.map(toAdmin), total, page, perPage);
  }

  async findOne(id: string): Promise<ProductAdmin> {
    return toAdmin(await this.findRow(id));
  }

  /**
   * Sobe as fotos antes de gravar (o Blob não participa de transação) e as
   * apaga se a gravação falhar, pra não deixar arquivo órfão.
   */
  async create(
    dto: CreateProductDto,
    files: UploadedPhoto[] = [],
  ): Promise<ProductAdmin> {
    const images = await this.upload(files);
    try {
      return toAdmin(await this.insert(dto, images));
    } catch (error) {
      await this.deleteAll(images);
      throw this.mapError(error);
    }
  }

  /**
   * Nunca recalcula o slug (é a URL do produto). Fotos novas substituem a
   * lista inteira; as antigas só são apagadas depois que a linha nova está
   * salva — se algo falhar no meio, o produto continua com as fotos de antes.
   */
  async update(
    id: string,
    dto: UpdateProductDto,
    files: UploadedPhoto[] = [],
  ): Promise<ProductAdmin> {
    const current = await this.findRow(id);
    const images = files.length > 0 ? await this.upload(files) : undefined;

    let updated: ProductRow;
    try {
      updated = await this.prisma.product.update({
        where: { id },
        data: { ...dto, ...(images && { images }) },
        include: WITH_CATEGORY,
      });
    } catch (error) {
      await this.deleteAll(images ?? []);
      throw this.mapError(error);
    }

    if (images) await this.deleteAll(current.images);
    return toAdmin(updated);
  }

  async remove(id: string): Promise<void> {
    const current = await this.findRow(id);
    await this.prisma.product.delete({ where: { id } });
    await this.deleteAll(current.images);
  }

  async listActive(
    categorySlug?: string,
    featured?: boolean,
  ): Promise<ProductPublic[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        ...ACTIVE,
        ...(featured && { featured: true }),
        category: {
          ...ACTIVE.category,
          ...(categorySlug && { slug: categorySlug }),
        },
      },
      include: WITH_CATEGORY,
      orderBy: ORDER,
    });
    return rows.map(toPublic);
  }

  async findActiveBySlug(slug: string): Promise<ProductPublic | null> {
    const row = await this.prisma.product.findFirst({
      where: { slug, ...ACTIVE },
      include: WITH_CATEGORY,
    });
    return row ? toPublic(row) : null;
  }

  private async insert(
    dto: CreateProductDto,
    images: string[],
    retried = false,
  ): Promise<ProductRow> {
    const slug = await uniqueSlug(dto.name, async (candidate) =>
      Boolean(
        await this.prisma.product.findUnique({ where: { slug: candidate } }),
      ),
    );
    try {
      return await this.prisma.product.create({
        data: { ...dto, slug, images },
        include: WITH_CATEGORY,
      });
    } catch (error) {
      // Corrida com outra criação de mesmo nome: tenta de novo uma vez, já
      // enxergando o slug que a outra pegou.
      if (!retried && isUniqueViolation(error, 'slug')) {
        return this.insert(dto, images, true);
      }
      throw error;
    }
  }

  private async findRow(id: string): Promise<ProductRow> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: WITH_CATEGORY,
    });
    if (!row) throw new NotFoundException('Produto não encontrado.');
    return row;
  }

  private upload(files: UploadedPhoto[]): Promise<string[]> {
    return Promise.all(
      files.map((f) => this.blob.uploadProductImage(f.buffer, f.mimetype)),
    );
  }

  /** Melhor esforço: uma foto que não sai do Blob não pode desfazer o que já foi gravado. */
  private async deleteAll(urls: string[]): Promise<void> {
    await Promise.allSettled(urls.map((url) => this.blob.deleteImage(url)));
  }

  private mapError(error: unknown) {
    if (isForeignKeyViolation(error)) {
      return new BadRequestException('Categoria não encontrada.');
    }
    return error;
  }
}
