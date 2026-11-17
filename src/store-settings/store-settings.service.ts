import { Injectable } from '@nestjs/common';
import type { StoreSettings as StoreSettingsRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDecimal, toMoney } from '../common/money';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

export interface StoreSettings {
  /** Site completo em `/`; desligado, `/` é a página "em breve". */
  siteEnabled: boolean;
  /** Venda pelo site (carrinho + Pagar.me); desligada, a compra é pelo WhatsApp. */
  storeEnabled: boolean;
  /**
   * Venda de ingressos pelo site, independente da loja. Um evento só vende
   * com este ligado e o `ticketSales` dele ligado.
   */
  ticketsEnabled: boolean;
  /**
   * A chave do Pagar.me está configurada? Só pro Dashboard avisar: a loja
   * pode ser ligada sem ela (o layout aparece), mas o pagamento não inicia.
   */
  paymentConfigured: boolean;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  pickupInstructions: string | null;
  maxInstallments: number;
  minInstallmentValue: number;
  /** Pronta entrega com este estoque ou menos entra no aviso do Dashboard. */
  lowStockThreshold: number;
  /** O interruptor e o texto da pausa, como a cliente deixou no admin. */
  storePaused: boolean;
  pauseMessage: string | null;
  pausedUntil: Date | null;
  /** A pausa valendo agora (`null` se não houver ou já passou da data de volta). */
  activePause: StorePause | null;
  updatedAt: Date;
}

/** Loja em pausa: o aviso do site e o motivo do checkout recusar. */
export interface StorePause {
  message: string | null;
  /** Quando a loja volta sozinha; `null` = até a cliente desligar a pausa. */
  until: string | null;
}

/**
 * A pausa vale com o interruptor ligado e antes da data de volta. Passou da
 * data, a loja reabre sozinha, sem ninguém precisar lembrar de desligar.
 */
export function activePause(
  row: Pick<StoreSettingsRow, 'storePaused' | 'pauseMessage' | 'pausedUntil'>,
  now: Date = new Date(),
): StorePause | null {
  if (!row.storePaused) return null;
  if (row.pausedUntil && row.pausedUntil <= now) return null;
  return {
    message: row.pauseMessage,
    until: row.pausedUntil?.toISOString() ?? null,
  };
}

/**
 * O que o site pode ler sem login: os interruptores, o parcelamento e a
 * retirada no ateliê (a página "Entrega e retirada" mostra endereço e
 * horário; o checkout já mostrava). Nada de `paymentConfigured`.
 */
export interface PublicStoreSettings {
  siteEnabled: boolean;
  storeEnabled: boolean;
  ticketsEnabled: boolean;
  maxInstallments: number;
  minInstallmentValue: number;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  pickupInstructions: string | null;
  /** Só quando a loja está em pausa agora. */
  storePause: StorePause | null;
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
    ticketsEnabled: row.ticketsEnabled,
    paymentConfigured: Boolean(process.env.PAGARME_SECRET_KEY),
    pickupEnabled: row.pickupEnabled,
    pickupAddress: row.pickupAddress,
    pickupHours: row.pickupHours,
    pickupInstructions: row.pickupInstructions,
    maxInstallments: row.maxInstallments,
    minInstallmentValue: toMoney(row.minInstallmentValue),
    lowStockThreshold: row.lowStockThreshold,
    storePaused: row.storePaused,
    pauseMessage: row.pauseMessage,
    pausedUntil: row.pausedUntil,
    activePause: activePause(row),
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
    const {
      siteEnabled,
      storeEnabled,
      ticketsEnabled,
      maxInstallments,
      minInstallmentValue,
      pickupEnabled,
      pickupAddress,
      pickupHours,
      pickupInstructions,
      activePause: storePause,
    } = await this.get();
    return {
      siteEnabled,
      storeEnabled,
      ticketsEnabled,
      maxInstallments,
      minInstallmentValue,
      pickupEnabled,
      pickupAddress,
      pickupHours,
      pickupInstructions,
      storePause,
    };
  }

  async update(dto: UpdateStoreSettingsDto): Promise<StoreSettings> {
    await this.row();
    const { minInstallmentValue, pausedUntil, ...rest } = dto;
    return toSettings(
      await this.prisma.storeSettings.update({
        where: { id: 1 },
        data: {
          ...rest,
          ...(minInstallmentValue !== undefined && {
            minInstallmentValue: toDecimal(minInstallmentValue),
          }),
          ...(pausedUntil !== undefined && {
            pausedUntil: pausedUntil === null ? null : new Date(pausedUntil),
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
