import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event as EventRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';
import { pageBounds, paginated } from '../common/pagination';
import { uniqueSlug } from '../common/slug';
import { toDecimal, toMoneyOrNull } from '../common/money';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/prisma-errors';
import type { UploadedFileData } from '../common/uploads';
import { StoreSettingsService } from '../store-settings/store-settings.service';
import { spotsLeft, takenSpots, type TakenSpots } from '../site-orders/spots';
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
  /** `null` = sem horário de fim. */
  endsAt: string | null;
  locationName: string | null;
  locationAddress: string | null;
  price: number | null;
  spots: number | null;
  imageUrl: string | null;
  /**
   * Venda/inscrição pelo site. No público já vem combinada com o interruptor
   * geral "Venda de ingressos" (`StoreSettings.ticketsEnabled`): o site só
   * olha este campo. No admin é o valor do próprio evento.
   */
  ticketSales: boolean;
  maxTicketsPerOrder: number;
  /** `null` = sem limite (`spots` null) ou venda desligada. */
  spotsLeft: number | null;
  soldOut: boolean;
}

export interface EventAdmin extends SiteEvent {
  published: boolean;
  createdAt: string;
  updatedAt: string;
  /** Ingressos de pedidos pagos. */
  sold: number;
  /** Ingressos de pedidos pendentes que ainda não venceram. */
  reserved: number;
}

/**
 * Meia-noite do dia de hoje no Rio, em UTC. O Brasil não tem horário de verão
 * desde 2019, então o fuso é sempre -03:00.
 */
export function startOfDayInRio(now: Date): Date {
  const rio = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(`${rio.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

/** Colidiria com a rota `GET /events/upcoming`. */
const RESERVED_SLUGS = new Set(['upcoming']);

/**
 * `selling` decide se as vagas contam: no público é o evento com o interruptor
 * geral, no admin só o evento.
 */
function toSiteEvent(
  row: EventRow,
  taken: TakenSpots | undefined,
  selling: boolean,
): SiteEvent {
  const left = selling ? spotsLeft(row.spots, taken) : null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    price: toMoneyOrNull(row.price),
    spots: row.spots,
    imageUrl: row.imageUrl,
    ticketSales: selling,
    maxTicketsPerOrder: row.maxTicketsPerOrder,
    spotsLeft: left,
    soldOut: selling && left === 0,
  };
}

function toEventAdmin(row: EventRow, taken?: TakenSpots): EventAdmin {
  return {
    ...toSiteEvent(row, taken, row.ticketSales),
    published: row.published,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sold: taken?.sold ?? 0,
    reserved: taken?.reserved ?? 0,
  };
}

/** Sem fim (`null`) não tem o que conferir. */
function assertDates(startsAt: Date, endsAt: Date | null) {
  if (endsAt && endsAt < startsAt) {
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
    ...(endsAt !== undefined && {
      endsAt: endsAt === null ? null : new Date(endsAt),
    }),
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
    private readonly storeSettings: StoreSettingsService,
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
    const taken = await takenSpots(
      this.prisma,
      rows.map((row) => row.id),
      new Date(),
    );
    return paginated(
      rows.map((row) => toEventAdmin(row, taken.get(row.id))),
      total,
      page,
      perPage,
    );
  }

  /**
   * Sobe a capa antes de gravar (o Blob não participa de transação) e apaga
   * se a gravação falhar, pra não deixar arquivo órfão.
   */
  async create(dto: CreateEventDto, file?: UploadedCover): Promise<EventAdmin> {
    assertDates(
      new Date(dto.startsAt),
      dto.endsAt ? new Date(dto.endsAt) : null,
    );
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
      dto.endsAt === undefined
        ? current.endsAt
        : dto.endsAt === null
          ? null
          : new Date(dto.endsAt),
    );
    const taken = (await takenSpots(this.prisma, [id], new Date())).get(id);
    const occupied = (taken?.sold ?? 0) + (taken?.reserved ?? 0);
    if (typeof dto.spots === 'number' && dto.spots < occupied) {
      throw new BadRequestException(`Já há ${occupied} vagas ocupadas.`);
    }
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
    return toEventAdmin(updated, taken);
  }

  /**
   * Evento com ingresso (pago, pendente ou cancelado) não sai do banco: os
   * pedidos apontam pra ele. A cliente despublica em vez de excluir.
   */
  async remove(id: string): Promise<void> {
    const current = await this.findRow(id);
    try {
      await this.prisma.event.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Esse evento tem ingressos vendidos. Despublique em vez de excluir.',
        );
      }
      throw error;
    }
    if (current.imageUrl) await this.blob.deleteImage(current.imageUrl);
  }

  /**
   * Publicados que ainda não terminaram (em andamento continuam), pela data.
   * Sem horário de fim, o evento fica na lista até o fim do dia em que começa.
   */
  async listUpcoming(): Promise<SiteEvent[]> {
    // `now` por chamada: a instância serverless vive vários minutos.
    const now = new Date();
    const rows = await this.prisma.event.findMany({
      where: {
        published: true,
        OR: [
          { endsAt: { gte: now } },
          { endsAt: null, startsAt: { gte: startOfDayInRio(now) } },
        ],
      },
      orderBy: { startsAt: 'asc' },
    });
    return this.toPublic(rows, now);
  }

  /** Qualquer publicado, passado ou futuro. Rascunho responde como inexistente. */
  async findPublishedBySlug(slug: string): Promise<SiteEvent> {
    const row = await this.prisma.event.findFirst({
      where: { slug, published: true },
    });
    if (!row) throw new NotFoundException('Evento não encontrado.');
    const [event] = await this.toPublic([row], new Date());
    return event;
  }

  /** Vagas contadas numa consulta só pra lista inteira (sem N+1). */
  private async toPublic(rows: EventRow[], now: Date): Promise<SiteEvent[]> {
    if (rows.length === 0) return [];
    const { ticketsEnabled } = await this.storeSettings.get();
    const selling = rows.filter((row) => ticketsEnabled && row.ticketSales);
    const taken = await takenSpots(
      this.prisma,
      selling.map((row) => row.id),
      now,
    );
    return rows.map((row) =>
      toSiteEvent(row, taken.get(row.id), ticketsEnabled && row.ticketSales),
    );
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
