import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaStorageService } from './media-storage.service';

/** Uma regra só apaga: idade. Nada é apagado por capacidade — ver bot-engine.service.ts. */
const RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;

/**
 * O `maxDuration` do `vercel.json` é 30s; este orçamento deixa folga para o
 * resto do job (a conferência que roda depois) e para a latência de cada
 * chamada ao R2.
 */
const PURGE_TIME_BUDGET_MS = 20_000;
const PURGE_BATCH_SIZE = 50;

export interface PurgeResult {
  purged: number;
}

export interface ReconcileResult {
  mediaBytesUsed: bigint;
}

/**
 * A metade do cron da Tarefa 11 — a que pode esperar. O teto (a metade
 * urgente) já é ao vivo, em `ConversationMessengerService.persist()`; o que
 * sobra para aqui é faxina de arquivo velho e conferência do contador.
 */
@Injectable()
export class MediaRetentionService {
  private readonly logger = new Logger(MediaRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  /**
   * Apaga o arquivo de toda imagem com mais de 3 anos — a mensagem
   * permanece, marcada como expirada (`mediaKey: null`, mas `kind` continua
   * `'image'`, o que já é o que o frontend precisa para distinguir de uma
   * mensagem que nunca teve mídia).
   *
   * Ordem por arquivo: **R2 primeiro, banco depois.** Se o R2 falhar, a
   * linha ainda aponta para o arquivo e a próxima execução tenta de novo;
   * se o banco falhar depois de um R2 bem-sucedido, o delete se repete e é
   * idempotente. A ordem inversa deixaria `mediaKey` apontando para um
   * arquivo que já não existe, sem chance de correção automática.
   *
   * Loteado com orçamento de tempo, não com um único `LIMIT` grande: uma
   * faxina atrasada (primeira execução depois de meses) não pode estourar o
   * `maxDuration` — ela só faz o que couber e deixa o resto para a próxima
   * execução diária.
   */
  async purgeExpired(): Promise<PurgeResult> {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const startedAt = Date.now();
    let purged = 0;

    while (Date.now() - startedAt < PURGE_TIME_BUDGET_MS) {
      const candidates = await this.prisma.message.findMany({
        where: {
          kind: 'image',
          mediaKey: { not: null },
          createdAt: { lt: cutoff },
        },
        take: PURGE_BATCH_SIZE,
        select: { id: true, mediaKey: true },
      });
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        // `mediaKey` já foi conferido `not: null` na query.
        await this.mediaStorage.delete(candidate.mediaKey as string);
        await this.prisma.message.update({
          where: { id: candidate.id },
          data: { mediaKey: null, mediaMimeType: null, mediaSizeBytes: null },
        });
        purged++;

        if (Date.now() - startedAt >= PURGE_TIME_BUDGET_MS) break;
      }
    }

    this.logger.log(`media retention: purged=${purged} images past 3 years`);
    return { purged };
  }

  /**
   * Recalcula o total em uso a partir do que de fato está gravado — a fonte
   * da verdade sempre foi o banco, o contador é só um cache dela mantido ao
   * vivo. Roda **depois** da faxina: reconciliar antes gravaria um número
   * que a própria purga desta execução ia invalidar em seguida.
   *
   * `mediaSizeBytes` é `Int` no schema (cabe, teto de 5 MB por mensagem),
   * mas o total tem que ir para o `BigInt` do contador — daí a conversão
   * explícita, não implícita.
   */
  async reconcileUsage(): Promise<ReconcileResult> {
    const { _sum } = await this.prisma.message.aggregate({
      _sum: { mediaSizeBytes: true },
      where: { mediaKey: { not: null } },
    });
    const mediaBytesUsed = BigInt(_sum.mediaSizeBytes ?? 0);

    await this.prisma.botSettings.update({
      where: { id: 1 },
      data: { mediaBytesUsed },
    });

    this.logger.log(
      `media retention: reconciled mediaBytesUsed=${mediaBytesUsed}`,
    );
    return { mediaBytesUsed };
  }
}
