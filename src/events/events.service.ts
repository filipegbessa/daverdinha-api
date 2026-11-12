import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event as EventRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';
import { pageBounds, paginated } from '../common/pagination';
import { uniqueSlug } from '../common/slug';
import { toDecimal, toMoneyOrNull } from '../common/money';
import { isUniqueViolation } from '../common/prisma-errors';
import type { UploadedFileData } from '../common/uploads';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';

/** O que o upload da capa usa do arquivo do Multer. */
export type UploadedCover = Pick<UploadedFileData, 'buffer' | 'mimetype'>;

/** O contrato público, igual a `src/features/site/types/event.ts` no site. */
export interface SiteEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startsAt: string;
  endsAt: string;
  locationName: string | null;
  locationAddress: string | null;
  price: number | null;
  spots: number | null;
  imageUrl: string | null;
  ctaUrl: string | null;
}

export interface EventAdmin extends SiteEvent {
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Colidiria com a rota `GET /events/upcoming`. */
const RESERVED_SLUGS = new Set(['upcoming']);

function toSiteEvent(row: EventRow): SiteEvent {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    price: toMoneyOrNull(row.price),
    spots: row.spots,
    imageUrl: row.imageUrl,
    ctaUrl: row.ctaUrl,
  };
}

function toEventAdmin(row: EventRow): EventAdmin {
  return {
    ...toSiteEvent(row),
    published: row.published,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertDates(startsAt: Date, endsAt: Date) {
  if (endsAt < startsAt) {
    throw new BadRequestException(
      'O evento não pode terminar antes de começar.',
    );
  }
}

/**
 * O DTO no formato que o Prisma grava: datas ISO viram `Date` e o preço vira
 * `Decimal` (ou `null`, gratuito). Campo ausente continua ausente.
 */
function toData(dto: UpdateEventDto) {
  const { price, startsAt, endsAt, ...rest } = dto;
  return {
    ...rest,
    ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
    ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
    ...(price !== undefined && {
      price: price === null ? null : toDecimal(price),
    }),
  };
}

/**
 * Agenda de eventos do site. Evento passado não é apagado nem despublicado
 * por ninguém: `listUpcoming` filtra por `endsAt` na consulta e a página dele
 * (`findPublishedBySlug`) continua no ar, pra link antigo não virar 404.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blob: BlobStorageService,
  ) {}

  /** Admin: rascunhos e passados incluídos, o mais recente primeiro. */
  async list(query: ListEventsDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const search = query.q?.trim();
    const where: Prisma.EventWhereInput = search
      ? { title: { contains: search, mode: 'insensitive' } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginated(rows.map(toEventAdmin), total, page, perPage);
  }

  /**
   * Sobe a capa antes de gravar (o Blob não participa de transação) e apaga
   * se a gravação falhar, pra não deixar arquivo órfão.
   */
  async create(dto: CreateEventDto, file?: UploadedCover): Promise<EventAdmin> {
    assertDates(new Date(dto.startsAt), new Date(dto.endsAt));
    const imageUrl = file ? await this.upload(file) : null;
    try {
      return toEventAdmin(await this.insert(dto, imageUrl));
    } catch (error) {
      if (imageUrl) await this.blob.deleteImage(imageUrl);
      throw error;
    }
  }

  /**
   * Nunca recalcula o slug (é a URL do evento). As datas são conferidas
   * contra o que está salvo, pra uma edição que muda só uma delas também não
   * deixar o evento terminar antes de começar. A capa antiga só é apagada
   * depois que a linha nova está salva.
   */
  async update(
    id: string,
    dto: UpdateEventDto,
    file?: UploadedCover,
  ): Promise<EventAdmin> {
    const current = await this.findRow(id);
    assertDates(
      dto.startsAt ? new Date(dto.startsAt) : current.startsAt,
      dto.endsAt ? new Date(dto.endsAt) : current.endsAt,
    );
    const { removeImage, ...fields } = dto;
    const newImage = file ? await this.upload(file) : undefined;
    const imageUrl =
      newImage !== undefined ? newImage : removeImage ? null : undefined;

    let updated: EventRow;
    try {
      updated = await this.prisma.event.update({
        where: { id },
        data: {
          ...toData(fields),
          ...(imageUrl !== undefined && { imageUrl }),
        },
      });
    } catch (error) {
      if (newImage) await this.blob.deleteImage(newImage);
      throw error;
    }

    if (imageUrl !== undefined && current.imageUrl) {
      await this.blob.deleteImage(current.imageUrl);
    }
    return toEventAdmin(updated);
  }

  async remove(id: string): Promise<void> {
    const current = await this.findRow(id);
    await this.prisma.event.delete({ where: { id } });
    if (current.imageUrl) await this.blob.deleteImage(current.imageUrl);
  }

  /** Publicados que ainda não terminaram (em andamento continuam), pela data. */
  async listUpcoming(): Promise<SiteEvent[]> {
    // `now` por chamada: a instância serverless vive vários minutos.
    const now = new Date();
    const rows = await this.prisma.event.findMany({
      where: { published: true, endsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toSiteEvent);
  }

  /** Qualquer publicado, passado ou futuro. Rascunho responde como inexistente. */
  async findPublishedBySlug(slug: string): Promise<SiteEvent> {
    const row = await this.prisma.event.findFirst({
      where: { slug, published: true },
    });
    if (!row) throw new NotFoundException('Evento não encontrado.');
    return toSiteEvent(row);
  }

  private async findRow(id: string): Promise<EventRow> {
    const row = await this.prisma.event.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Evento não encontrado.');
    return row;
  }

  private upload(file: UploadedCover): Promise<string> {
    return this.blob.uploadEventImage(file.buffer, file.mimetype);
  }

  /**
   * Checar o slug antes não fecha a corrida entre duas criações com o mesmo
   * título; o P2002 no slug tenta de novo, já com o outro gravado.
   */
  private async insert(
    dto: CreateEventDto,
    imageUrl: string | null,
  ): Promise<EventRow> {
    const data = toData(dto) as Omit<
      Prisma.EventCreateInput,
      'slug' | 'imageUrl'
    >;
    for (let attempt = 0; ; attempt++) {
      const slug = await uniqueSlug(
        dto.title,
        async (s) =>
          RESERVED_SLUGS.has(s) ||
          (await this.prisma.event.count({ where: { slug: s } })) > 0,
      );
      try {
        return await this.prisma.event.create({
          data: { ...data, slug, imageUrl },
        });
      } catch (error) {
        if (attempt < 2 && isUniqueViolation(error, 'slug')) continue;
        throw error;
      }
    }
  }
}
