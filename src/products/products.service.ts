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
import {
  availabilityOf,
  reservedQuantities,
  stockLeft,
  type Availability,
} from '../site-orders/stock';
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
  /** Já desconta as unidades reservadas por pedidos pendentes. */
  availability: Availability;
  /** Prazo de confecção; só vem preenchido quando é sob encomenda. */
  leadTimeDays: number | null;
}

export interface ProductAdmin extends ProductPublic {
  categoryId: string;
  active: boolean;
  featured: boolean;
  order: number;
  /** O que está cadastrado, sem descontar reservas. `null` = sob encomenda. */
  stock: number | null;
  // `leadTimeDays` aqui é o prazo salvo, mesmo em pronta entrega: o admin
  // preenche o campo com ele se a cliente voltar pra sob encomenda.
}

const WITH_CATEGORY = {
  category: { select: { id: true, name: true, slug: true } },
} as const;

const ORDER = [{ order: 'asc' as const }, { name: 'asc' as const }];

/** Produto ativo de categoria ativa: tirar a categoria do ar tira os produtos dela junto. */
const ACTIVE = { active: true, category: { active: true } } as const;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof WITH_CATEGORY }>;

/** Unidades reservadas por pedidos pendentes, por produto (ver `reservedQuantities`). */
type Reserved = Map<string, number>;

/**
 * Único lugar que converte `price`: o `Decimal` do Prisma vira string no
 * JSON ("89.9"), e o site espera número. Toda leitura passa por aqui.
 */
function toAdmin(row: ProductRow, reserved: Reserved): ProductAdmin {
  return {
    ...toPublic(row, reserved),
    categoryId: row.categoryId,
    active: row.active,
    featured: row.featured,
    order: row.order,
    stock: row.stock,
    leadTimeDays: row.leadTimeDays,
  };
}

function toPublic(row: ProductRow, reserved: Reserved): ProductPublic {
  const availability = availabilityOf(
    stockLeft(row.stock, reserved.get(row.id) ?? 0),
  );
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: new Prisma.Decimal(row.price).toNumber(),
    images: row.images,
    category: row.category,
    availability,
    leadTimeDays: availability === 'made_to_order' ? row.leadTimeDays : null,
  };
}

/**
 * Sob encomenda precisa de prazo. Só confere quando a requisição mexe em
 * estoque ou prazo: um PATCH só do "ativo", ou um produto antigo que nunca
 * teve prazo, continua salvando.
 */
function assertLeadTime(
  dto: Pick<CreateProductDto, 'stock' | 'leadTimeDays'>,
  current: { stock: number | null; leadTimeDays: number | null },
) {
  if (dto.stock === undefined && dto.leadTimeDays === undefined) return;
  const stock = dto.stock !== undefined ? dto.stock : current.stock;
  const leadTimeDays =
    dto.leadTimeDays !== undefined ? dto.leadTimeDays : current.leadTimeDays;
  if (stock === null && leadTimeDays === null) {
    throw new BadRequestException('Informe o prazo de confecção.');
  }
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
    const reserved = await this.reservedFor(rows);
    return paginated(
      rows.map((row) => toAdmin(row, reserved)),
      total,
      page,
      perPage,
    );
  }

  async findOne(id: string): Promise<ProductAdmin> {
    return this.withReservations(await this.findRow(id));
  }

  /**
   * Sobe as fotos antes de gravar (o Blob não participa de transação) e as
   * apaga se a gravação falhar, pra não deixar arquivo órfão.
   */
  async create(
    dto: CreateProductDto,
    files: UploadedPhoto[] = [],
  ): Promise<ProductAdmin> {
    assertLeadTime(dto, { stock: null, leadTimeDays: null });
    const images = await this.upload(files);
    try {
      return this.withReservations(await this.insert(dto, images));
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
    assertLeadTime(dto, current);
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
    return this.withReservations(updated);
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
    const reserved = await this.reservedFor(rows);
    return rows.map((row) => toPublic(row, reserved));
  }

  async findActiveBySlug(slug: string): Promise<ProductPublic | null> {
    const row = await this.prisma.product.findFirst({
      where: { slug, ...ACTIVE },
      include: WITH_CATEGORY,
    });
    return row ? toPublic(row, await this.reservedFor([row])) : null;
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

  /** Uma consulta agrupada pra lista toda; sob encomenda não precisa de reserva. */
  private reservedFor(rows: ProductRow[]): Promise<Reserved> {
    const counted = rows.filter((r) => r.stock !== null).map((r) => r.id);
    return reservedQuantities(this.prisma, counted, new Date());
  }

  private async withReservations(row: ProductRow): Promise<ProductAdmin> {
    return toAdmin(row, await this.reservedFor([row]));
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
