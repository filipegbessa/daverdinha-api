import { Injectable } from '@nestjs/common';
import { Prisma, StoreSettings as StoreSettingsRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

export interface StoreSettings {
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  pickupInstructions: string | null;
  maxInstallments: number;
  minInstallmentValue: number;
  updatedAt: Date;
}

/** O que o site pode ler sem login: só o necessário pra mostrar o parcelamento. */
export interface PublicStoreSettings {
  maxInstallments: number;
  minInstallmentValue: number;
}

/**
 * Valores da primeira leitura, se a linha ainda não existir (banco sem seed).
 * O endereço é o mesmo de `daverdinha/src/data/business.ts`.
 */
const DEFAULTS = {
  pickupAddress:
    'R. Capiberibe, 32 - Santo Cristo, Rio de Janeiro - RJ, 20220-030',
  pickupHours: 'Combinar pelo WhatsApp',
};

function toSettings(row: StoreSettingsRow): StoreSettings {
  return {
    pickupEnabled: row.pickupEnabled,
    pickupAddress: row.pickupAddress,
    pickupHours: row.pickupHours,
    pickupInstructions: row.pickupInstructions,
    maxInstallments: row.maxInstallments,
    minInstallmentValue: new Prisma.Decimal(row.minInstallmentValue).toNumber(),
    updatedAt: row.updatedAt,
  };
}

/** Configurações da loja: linha única (id 1), como `BotSettings`. */
@Injectable()
export class StoreSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<StoreSettings> {
    return toSettings(await this.row());
  }

  async getPublic(): Promise<PublicStoreSettings> {
    const { maxInstallments, minInstallmentValue } = await this.get();
    return { maxInstallments, minInstallmentValue };
  }

  async update(dto: UpdateStoreSettingsDto): Promise<StoreSettings> {
    await this.row();
    const { minInstallmentValue, ...rest } = dto;
    return toSettings(
      await this.prisma.storeSettings.update({
        where: { id: 1 },
        data: {
          ...rest,
          ...(minInstallmentValue !== undefined && {
            minInstallmentValue: new Prisma.Decimal(minInstallmentValue),
          }),
        },
      }),
    );
  }

  /** Lê a linha 1 e a cria com os padrões se não existir; nunca duplica. */
  private row(): Promise<StoreSettingsRow> {
    return this.prisma.storeSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...DEFAULTS },
    });
  }
}
