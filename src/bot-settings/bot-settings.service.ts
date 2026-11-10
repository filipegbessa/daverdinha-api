import { BadRequestException, Injectable } from '@nestjs/common';
import type { BotSettings as BotSettingsRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';

/** O que o admin recebe: a linha, com `mediaBytesUsed` em `number`. */
export interface BotSettingsView extends Omit<
  BotSettingsRow,
  'mediaBytesUsed'
> {
  mediaBytesUsed: number;
}

/**
 * Valores da primeira leitura, se a linha ainda não existir (banco sem seed).
 * Só a mensagem de boas-vindas não tem `@default` no schema; o texto é o
 * mesmo do `prisma/seed.ts`. O bot nasce desligado (`@default(false)`).
 */
const DEFAULTS = {
  welcomeMessage:
    'Oi! Que bom te ver por aqui 🌱 Bem-vinda(o) à Daverdinha — um espaço pra plantar, criar e brindar. Como posso te ajudar hoje?',
};

/**
 * `mediaBytesUsed` é `BigInt` no Postgres, que o `JSON.stringify` não sabe
 * serializar. 8 GB em bytes estão longe de `Number.MAX_SAFE_INTEGER`, então
 * converter na saída é seguro; por dentro ele continua `bigint` (a conferência
 * do teto no BotEngineService precisa disso).
 */
function toView(row: BotSettingsRow): BotSettingsView {
  return { ...row, mediaBytesUsed: Number(row.mediaBytesUsed) };
}

/** Linha única (id 1), como `StoreSettings`. */
@Injectable()
export class BotSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A linha crua, pro uso interno (bot-engine, mídia). */
  get(): Promise<BotSettingsRow> {
    return this.row();
  }

  async getView(): Promise<BotSettingsView> {
    return toView(await this.row());
  }

  async update(dto: UpdateBotSettingsDto): Promise<BotSettingsView> {
    if (dto.botEnabled === true) {
      const activeCount = await this.prisma.menuItem.count({
        where: { active: true },
      });
      if (activeCount === 0) {
        throw new BadRequestException(
          'Não é possível ligar o bot sem nenhum item de menu ativo.',
        );
      }
    }
    await this.row();
    return toView(
      await this.prisma.botSettings.update({ where: { id: 1 }, data: dto }),
    );
  }

  async autoDisableIfNoActiveMenuItems() {
    const activeCount = await this.prisma.menuItem.count({
      where: { active: true },
    });
    if (activeCount === 0) {
      await this.row();
      await this.prisma.botSettings.update({
        where: { id: 1 },
        data: { botEnabled: false },
      });
    }
  }

  /** Lê a linha 1 e a cria com os padrões se não existir; nunca duplica. */
  private row(): Promise<BotSettingsRow> {
    return this.prisma.botSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...DEFAULTS },
    });
  }
}
