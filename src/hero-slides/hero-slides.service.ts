import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HeroSlide as HeroSlideRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';
import { isRecordNotFound } from '../common/prisma-errors';
import type { UploadedFileData } from '../common/uploads';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';
import { ReorderHeroSlidesDto } from './dto/reorder-hero-slides.dto';

const NOT_FOUND = 'Destaque não encontrado.';

/** O que o upload da imagem usa do arquivo do Multer. */
export type UploadedSlideImage = Pick<UploadedFileData, 'buffer' | 'mimetype'>;

/** O contrato público, igual a `src/features/site/types/hero-slide.ts` no site. */
export interface HeroSlide {
  id: string;
  eyebrow: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  /** O botão principal vem com os dois ou com nenhum. */
  linkLabel: string | null;
  linkUrl: string | null;
  whatsappLabel: string | null;
  /** Sem mensagem, não há botão do WhatsApp. */
  whatsappMessage: string | null;
}

export interface HeroSlideAdmin extends HeroSlide {
  order: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  /** Ativo e dentro da validade agora: está na home neste momento. */
  live: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Ativo, já começou e ainda não terminou. Sem datas, vale sempre. */
export function isLive(
  row: Pick<HeroSlideRow, 'active' | 'startsAt' | 'endsAt'>,
  now: Date,
): boolean {
  if (!row.active) return false;
  if (row.startsAt && row.startsAt > now) return false;
  if (row.endsAt && row.endsAt <= now) return false;
  return true;
}

function toPublic(row: HeroSlideRow): HeroSlide {
  const hasButton = Boolean(row.linkLabel && row.linkUrl);
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    linkLabel: hasButton ? row.linkLabel : null,
    linkUrl: hasButton ? row.linkUrl : null,
    whatsappLabel: row.whatsappLabel,
    whatsappMessage: row.whatsappMessage,
  };
}

function toAdmin(row: HeroSlideRow, now: Date): HeroSlideAdmin {
  return {
    ...toPublic(row),
    // No admin, o que está salvo: um botão pela metade aparece pra corrigir.
    linkLabel: row.linkLabel,
    linkUrl: row.linkUrl,
    order: row.order,
    active: row.active,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    live: isLive(row, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Datas do DTO em `Date`; ausente continua ausente, vazio vira `null`. */
function toDates(dto: UpdateHeroSlideDto) {
  const { startsAt, endsAt, ...rest } = dto;
  return {
    ...rest,
    ...(startsAt !== undefined && {
      startsAt: startsAt === null ? null : new Date(startsAt),
    }),
    ...(endsAt !== undefined && {
      endsAt: endsAt === null ? null : new Date(endsAt),
    }),
  };
}

/**
 * Conferido contra o slide inteiro (o salvo com o que muda), pra uma edição
 * que mexe num campo só também não deixar o botão pela metade.
 */
function assertConsistent(slide: {
  linkLabel: string | null;
  linkUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  if (Boolean(slide.linkLabel) !== Boolean(slide.linkUrl)) {
    throw new BadRequestException(
      'Preencha o texto e o link do botão principal, ou deixe os dois vazios.',
    );
  }
  if (slide.startsAt && slide.endsAt && slide.endsAt <= slide.startsAt) {
    throw new BadRequestException(
      'O fim da exibição tem que ser depois do início.',
    );
  }
}

/**
 * Destaques do topo da home. São poucos (um slideshow), então a lista do
 * admin não é paginada, como o menu do bot. A ordem é o campo `order`,
 * reescrito inteiro a cada reordenação.
 */
@Injectable()
export class HeroSlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blob: BlobStorageService,
  ) {}

  /** Admin: todos, na ordem de exibição, com o "no ar agora". */
  async list(): Promise<HeroSlideAdmin[]> {
    const rows = await this.prisma.heroSlide.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    return rows.map((row) => toAdmin(row, now));
  }

  async findOne(id: string): Promise<HeroSlideAdmin> {
    return toAdmin(await this.findRow(id), new Date());
  }

  /**
   * Público: os que estão no ar agora, na ordem. A validade é filtrada na
   * consulta (`now` por chamada: a instância serverless vive vários minutos).
   */
  async listActive(): Promise<HeroSlide[]> {
    const now = new Date();
    const rows = await this.prisma.heroSlide.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toPublic);
  }

  /**
   * Slide novo entra no fim da fila. A imagem sobe antes de gravar (o Blob
   * não participa de transação) e é apagada se a gravação falhar.
   */
  async create(
    dto: CreateHeroSlideDto,
    file?: UploadedSlideImage,
  ): Promise<HeroSlideAdmin> {
    const data = toDates(dto);
    assertConsistent({
      linkLabel: data.linkLabel ?? null,
      linkUrl: data.linkUrl ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
    });
    const imageUrl = file ? await this.upload(file) : null;
    try {
      const last = await this.prisma.heroSlide.aggregate({
        _max: { order: true },
      });
      const row = await this.prisma.heroSlide.create({
        data: {
          ...data,
          title: dto.title,
          imageUrl,
          order: (last._max.order ?? -1) + 1,
        },
      });
      return toAdmin(row, new Date());
    } catch (error) {
      if (imageUrl) await this.blob.deleteImage(imageUrl);
      throw error;
    }
  }

  /** A imagem antiga só é apagada depois que a linha nova está salva. */
  async update(
    id: string,
    dto: UpdateHeroSlideDto,
    file?: UploadedSlideImage,
  ): Promise<HeroSlideAdmin> {
    const current = await this.findRow(id);
    const { removeImage, ...fields } = dto;
    const data = toDates(fields);
    assertConsistent({
      linkLabel:
        data.linkLabel !== undefined ? data.linkLabel : current.linkLabel,
      linkUrl: data.linkUrl !== undefined ? data.linkUrl : current.linkUrl,
      startsAt: data.startsAt !== undefined ? data.startsAt : current.startsAt,
      endsAt: data.endsAt !== undefined ? data.endsAt : current.endsAt,
    });

    const newImage = file ? await this.upload(file) : undefined;
    const imageUrl =
      newImage !== undefined ? newImage : removeImage ? null : undefined;

    let updated: HeroSlideRow;
    try {
      updated = await this.prisma.heroSlide.update({
        where: { id },
        data: { ...data, ...(imageUrl !== undefined && { imageUrl }) },
      });
    } catch (error) {
      if (newImage) await this.blob.deleteImage(newImage);
      throw error;
    }

    if (imageUrl !== undefined && current.imageUrl) {
      await this.blob.deleteImage(current.imageUrl);
    }
    return toAdmin(updated, new Date());
  }

  async reorder(dto: ReorderHeroSlidesDto): Promise<HeroSlideAdmin[]> {
    const ops = dto.orderedIds.map((id, index) =>
      this.prisma.heroSlide.update({ where: { id }, data: { order: index } }),
    );
    try {
      await this.prisma.$transaction(ops);
    } catch (error) {
      // Um id que não existe desfaz a transação inteira: nenhuma ordem muda.
      if (isRecordNotFound(error)) throw new NotFoundException(NOT_FOUND);
      throw error;
    }
    return this.list();
  }

  async remove(id: string): Promise<void> {
    const current = await this.findRow(id);
    await this.prisma.heroSlide.delete({ where: { id } });
    if (current.imageUrl) await this.blob.deleteImage(current.imageUrl);
  }

  private async findRow(id: string): Promise<HeroSlideRow> {
    const row = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private upload(file: UploadedSlideImage): Promise<string> {
    return this.blob.uploadHeroImage(file.buffer, file.mimetype);
  }
}
