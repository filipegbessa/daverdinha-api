import { ConflictException, Injectable } from '@nestjs/common';
import type { StoreSettings as StoreSettingsRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDecimal, toMoney } from '../common/money';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

export interface StoreSettings {
  /** Site completo em `/`; desligado, `/` é a página "em breve". */
  siteEnabled: boolean;
  /** Venda pelo site (carrinho + Pagar.me); desligada, a compra é pelo WhatsApp. */
  storeEnabled: boolean;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  pickupInstructions: string | null;
  maxInstallments: number;
  minInstallmentValue: number;
  updatedAt: Date;
}

/** O que o site pode ler sem login: os dois interruptores e o parcelamento. */
export interface PublicStoreSettings {
  siteEnabled: boolean;
  storeEnabled: boolean;
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
    siteEnabled: row.siteEnabled,
    storeEnabled: row.storeEnabled,
    pickupEnabled: row.pickupEnabled,
    pickupAddress: row.pickupAddress,
    pickupHours: row.pickupHours,
    pickupInstructions: row.pickupInstructions,
    maxInstallments: row.maxInstallments,
    minInstallmentValue: toMoney(row.minInstallmentValue),
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
    const { siteEnabled, storeEnabled, maxInstallments, minInstallmentValue } =
      await this.get();
    return { siteEnabled, storeEnabled, maxInstallments, minInstallmentValue };
  }

  async update(dto: UpdateStoreSettingsDto): Promise<StoreSettings> {
    // Loja ligada sem credencial do Pagar.me = todo checkout falhando com 503.
    if (dto.storeEnabled && !process.env.PAGARME_SECRET_KEY) {
      throw new ConflictException(
        'O pagamento ainda não está configurado (chave do Pagar.me). A loja continua desligada.',
      );
    }
    await this.row();
    const { minInstallmentValue, ...rest } = dto;
    return toSettings(
      await this.prisma.storeSettings.update({
        where: { id: 1 },
        data: {
          ...rest,
          ...(minInstallmentValue !== undefined && {
            minInstallmentValue: toDecimal(minInstallmentValue),
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
