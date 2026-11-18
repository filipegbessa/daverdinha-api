import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';
import type { UploadedFileData } from '../common/uploads';
import { UpdateAboutDto } from './dto/update-about.dto';

export type UploadedAboutImage = Pick<UploadedFileData, 'buffer' | 'mimetype'>;

/** O contrato público, igual a `src/features/site/types/about.ts` no site. */
export interface AboutContent {
  /** `false` = nunca salvo no admin: o site usa o texto do código. */
  configured: boolean;
  title: string | null;
  text: string | null;
  imageUrl: string | null;
  /** `null` = sem link pro Instagram. */
  instagramLabel: string | null;
  updatedAt: string | null;
}

const ID = 1;

/**
 * Textos do site editados no admin. Linha única (id 1), criada no primeiro
 * salvamento: sem ela, a resposta diz `configured: false`.
 */
@Injectable()
export class SiteContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blob: BlobStorageService,
  ) {}

  async getAbout(): Promise<AboutContent> {
    const row = await this.prisma.siteContent.findUnique({ where: { id: ID } });
    return {
      configured: Boolean(row?.aboutTitle && row.aboutText),
      title: row?.aboutTitle ?? null,
      text: row?.aboutText ?? null,
      imageUrl: row?.aboutImageUrl ?? null,
      instagramLabel: row?.aboutInstagramLabel ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /**
   * A foto nova sobe antes de gravar e é apagada se a gravação falhar; a
   * antiga só sai depois que a linha nova está salva.
   */
  async updateAbout(
    dto: UpdateAboutDto,
    file?: UploadedAboutImage,
  ): Promise<AboutContent> {
    const current = await this.prisma.siteContent.findUnique({
      where: { id: ID },
    });
    const newImage = file
      ? await this.blob.uploadSiteImage(file.buffer, file.mimetype)
      : undefined;
    const imageUrl =
      newImage !== undefined ? newImage : dto.removeImage ? null : undefined;
    const data = {
      aboutTitle: dto.title,
      aboutText: dto.text,
      aboutInstagramLabel: dto.instagramLabel ?? null,
      ...(imageUrl !== undefined && { aboutImageUrl: imageUrl }),
    };

    try {
      await this.prisma.siteContent.upsert({
        where: { id: ID },
        create: { id: ID, ...data },
        update: data,
      });
    } catch (error) {
      if (newImage) await this.blob.deleteImage(newImage);
      throw error;
    }

    if (imageUrl !== undefined && current?.aboutImageUrl) {
      await this.blob.deleteImage(current.aboutImageUrl);
    }
    return this.getAbout();
  }
}
