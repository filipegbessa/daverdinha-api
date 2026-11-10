import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageBounds, paginated } from '../common/pagination';
import { toMoney } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { DeliveryAreasService } from '../delivery-locations/delivery-areas.service';
import { StoreSettingsService } from '../store-settings/store-settings.service';
import { installmentsFor } from '../store-settings/installments';
import { availableStock } from './stock';
import { lineTotal, orderTotals } from './pricing';
import type { CartItemDto } from '../checkout/dto/cart-item.dto';
import { parseOrderCode } from './order-code';
import {
  toAdminOrder,
  toPublicOrder,
  WITH_ITEMS,
  type PublicSiteOrder,
  type SiteOrderAdmin,
  type SiteOrderRow,
} from './site-order-views';
import type { ListSiteOrdersDto } from './dto/list-site-orders.dto';
import type { UpdateFulfillmentDto } from './dto/update-fulfillment.dto';

/** Cliente do Prisma ou transação: a cotação roda dentro da criação do pedido. */
type Db = Prisma.TransactionClient;

export type QuoteProblem = {
  productId: string;
  reason: 'not_found' | 'inactive' | 'insufficient_stock';
  /** Só em `insufficient_stock`: quantas unidades dá pra comprar (0 = esgotado). */
  available?: number;
};

export type DeliveryUnavailableReason =
  'no_cep' | 'unresolved' | 'not_covered' | 'no_area';

/** A cotação com `Decimal`: é ela que a criação do pedido reaproveita. */
export interface QuoteDetails {
  lines: {
    product: {
      id: string;
      name: string;
      slug: string;
      images: string[];
      stock: number | null;
      leadTimeDays: number | null;
    };
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }[];
  subtotal: Prisma.Decimal;
  installments: number;
  pickup:
    | {
        available: true;
        address: string;
        hours: string;
        instructions: string | null;
      }
    | { available: false };
  delivery:
    | {
        available: true;
        fee: Prisma.Decimal;
        bairro: string;
        zone: string;
        area: string;
      }
    | { available: false; reason: DeliveryUnavailableReason; bairro?: string };
  problems: QuoteProblem[];
}

/** O contrato público de `POST /checkout/quote` (valores como número). */
export interface CheckoutQuote {
  items: {
    productId: string;
    name: string;
    slug: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    imageUrl: string | null;
    availability: 'in_stock' | 'made_to_order';
    leadTimeDays: number | null;
  }[];
  subtotal: number;
  /** Parcelas sem juros sobre o subtotal; com o frete o total sobe e o checkout recalcula. */
  installments: number;
  pickup: QuoteDetails['pickup'];
  delivery:
    | { available: true; fee: number; bairro: string; area: string }
    | { available: false; reason: DeliveryUnavailableReason; bairro?: string };
  problems: QuoteProblem[];
}

/** Item repetido no carrinho vira uma linha só, com as quantidades somadas. */
function mergeItems(items: CartItemDto[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const { productId, quantity } of items) {
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  return merged;
}

@Injectable()
export class SiteOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryLocations: DeliveryLocationsService,
    private readonly deliveryAreas: DeliveryAreasService,
    private readonly storeSettings: StoreSettingsService,
  ) {}

  /**
   * Preço, estoque e frete calculados no servidor a partir do banco. O
   * carrinho do site só manda `{ productId, quantity }`: o que ele acha que
   * custa não entra na conta.
   */
  async quote(items: CartItemDto[], cep?: string): Promise<CheckoutQuote> {
    return toPublicQuote(await this.quoteDetails(this.prisma, items, cep));
  }

  /**
   * A cotação completa. Recebe `db` pra rodar dentro da transação que cria o
   * pedido, depois de travar os produtos, e enxergar o estoque daquele
   * momento.
   */
  async quoteDetails(
    db: Db,
    items: CartItemDto[],
    cep?: string,
    now: Date = new Date(),
  ): Promise<QuoteDetails> {
    const merged = mergeItems(items);
    const ids = [...merged.keys()];
    const [products, stockLeft, settings, delivery] = await Promise.all([
      db.product.findMany({
        where: { id: { in: ids } },
        include: { category: { select: { active: true } } },
      }),
      availableStock(db, ids, now),
      this.storeSettings.get(),
      this.deliveryFor(cep),
    ]);

    const lines: QuoteDetails['lines'] = [];
    const problems: QuoteProblem[] = [];
    for (const [productId, quantity] of merged) {
      const product = products.find((p) => p.id === productId);
      if (!product) {
        problems.push({ productId, reason: 'not_found' });
        continue;
      }
      if (!product.active || !product.category.active) {
        problems.push({ productId, reason: 'inactive' });
        continue;
      }
      const left = stockLeft.get(productId) ?? null;
      if (left !== null && quantity > left) {
        problems.push({
          productId,
          reason: 'insufficient_stock',
          available: left,
        });
        continue;
      }
      const unitPrice = new Prisma.Decimal(product.price);
      lines.push({
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          images: product.images,
          stock: product.stock,
          leadTimeDays: product.leadTimeDays,
        },
        quantity,
        unitPrice,
        lineTotal: lineTotal(unitPrice, quantity),
      });
    }

    const { subtotal } = orderTotals(
      lines.map((l) => l.lineTotal),
      new Prisma.Decimal(0),
    );
    return {
      lines,
      subtotal,
      installments: installmentsFor(subtotal, settings),
      pickup: settings.pickupEnabled
        ? {
            available: true,
            address: settings.pickupAddress,
            hours: settings.pickupHours,
            instructions: settings.pickupInstructions,
          }
        : { available: false },
      delivery,
      problems,
    };
  }

  /**
   * A página pública do pedido, achada pelo token secreto (nunca pelo número,
   * que é sequencial). Pedido pendente que passou do prazo vira `expired`
   * aqui mesmo, na leitura: não tem cron.
   */
  async findPublicByToken(token: string): Promise<PublicSiteOrder> {
    const row = await this.prisma.siteOrder.findUnique({
      where: { publicToken: token },
      include: WITH_ITEMS,
    });
    if (!row) throw new NotFoundException('Pedido não encontrado.');
    const [order, settings] = await Promise.all([
      this.expireIfDue(row),
      this.storeSettings.get(),
    ]);
    return toPublicOrder(order, settings);
  }

  /**
   * Lista do admin, mais recente primeiro. Sem filtro de status mostra só os
   * pagos, que é o que a cliente acompanha no dia a dia; pendentes e vencidos
   * ficam atrás do filtro.
   */
  async list(query: ListSiteOrdersDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const search = query.q?.trim();
    const number = search ? parseOrderCode(search) : null;
    const where: Prisma.SiteOrderWhereInput = {
      status: query.status ?? 'paid',
      ...(query.kind && { kind: query.kind }),
      ...(search && {
        OR: [
          { customerName: { contains: search, mode: 'insensitive' } },
          ...(number !== null ? [{ number }] : []),
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.siteOrder.findMany({
        where,
        include: WITH_ITEMS,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.siteOrder.count({ where }),
    ]);
    return paginated(rows.map(toAdminOrder), total, page, perPage);
  }

  async findById(id: string): Promise<SiteOrderAdmin> {
    return toAdminOrder(await this.expireIfDue(await this.findRow(id)));
  }

  /** Preparo só faz sentido em pedido pago. */
  async updateFulfillment(
    id: string,
    dto: UpdateFulfillmentDto,
  ): Promise<SiteOrderAdmin> {
    const row = await this.findRow(id);
    if (row.status !== 'paid') {
      throw new ConflictException(
        'Só dá pra mudar o preparo de um pedido pago.',
      );
    }
    return toAdminOrder(
      await this.prisma.siteOrder.update({
        where: { id },
        data: { fulfillmentStatus: dto.fulfillmentStatus },
        include: WITH_ITEMS,
      }),
    );
  }

  /**
   * Cancela um pedido pendente ou pago. Pago devolve o estoque (o estorno do
   * dinheiro é no painel do gateway, na V1). A troca de status é condicional,
   * pra um cancelamento e um pagamento chegando juntos não devolverem estoque
   * de um pedido que acabou pago.
   */
  async cancel(id: string): Promise<SiteOrderAdmin> {
    const row = await this.findRow(id);
    if (row.status !== 'pending_payment' && row.status !== 'paid') {
      throw new ConflictException('Esse pedido não pode mais ser cancelado.');
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.siteOrder.updateMany({
        where: { id, status: row.status },
        data: { status: 'cancelled' },
      });
      if (count === 0) {
        throw new ConflictException(
          'O pedido mudou enquanto era cancelado. Recarregue a página.',
        );
      }
      if (row.status === 'paid' && row.kind === 'products') {
        await returnStock(tx, row);
      }
    });
    return this.findById(id);
  }

  private async findRow(id: string): Promise<SiteOrderRow> {
    const row = await this.prisma.siteOrder.findUnique({
      where: { id },
      include: WITH_ITEMS,
    });
    if (!row) throw new NotFoundException('Pedido não encontrado.');
    return row;
  }

  /**
   * Pendente depois do prazo vira `expired`. Condicional no status, pra não
   * atropelar um pagamento que tenha chegado no mesmo instante.
   */
  private async expireIfDue(
    row: SiteOrderRow,
    now: Date = new Date(),
  ): Promise<SiteOrderRow> {
    if (row.status !== 'pending_payment' || row.expiresAt > now) return row;
    const { count } = await this.prisma.siteOrder.updateMany({
      where: { id: row.id, status: 'pending_payment' },
      data: { status: 'expired' },
    });
    if (count === 1) return { ...row, status: 'expired' };
    return this.findRow(row.id);
  }

  /**
   * Entrega pro CEP: o bairro tem que estar atendido e numa área com valor.
   * Qualquer outro caso é entrega indisponível, nunca frete zero.
   */
  private async deliveryFor(cep?: string): Promise<QuoteDetails['delivery']> {
    if (!cep?.trim()) return { available: false, reason: 'no_cep' };
    const resolution = await this.deliveryLocations.resolveCep(cep);
    if (resolution.status === 'unresolved') {
      return { available: false, reason: 'unresolved' };
    }
    if (resolution.status === 'not_covered') {
      return {
        available: false,
        reason: 'not_covered',
        bairro: resolution.bairro,
      };
    }
    const area = await this.deliveryAreas.feeForLocation(resolution.locationId);
    if (!area) {
      return { available: false, reason: 'no_area', bairro: resolution.bairro };
    }
    return {
      available: true,
      fee: area.fee,
      bairro: resolution.bairro,
      zone: resolution.zone,
      area: area.area,
    };
  }
}

function toPublicQuote(details: QuoteDetails): CheckoutQuote {
  return {
    items: details.lines.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      slug: line.product.slug,
      unitPrice: toMoney(line.unitPrice),
      quantity: line.quantity,
      lineTotal: toMoney(line.lineTotal),
      imageUrl: line.product.images[0] ?? null,
      availability: line.product.stock === null ? 'made_to_order' : 'in_stock',
      leadTimeDays:
        line.product.stock === null ? line.product.leadTimeDays : null,
    })),
    subtotal: toMoney(details.subtotal),
    installments: details.installments,
    pickup: details.pickup,
    delivery: details.delivery.available
      ? {
          available: true,
          fee: toMoney(details.delivery.fee),
          bairro: details.delivery.bairro,
          area: details.delivery.area,
        }
      : details.delivery,
    problems: details.problems,
  };
}

/** Devolve ao estoque as unidades de um pedido pago (só de produto com estoque contado). */
async function returnStock(db: Db, order: SiteOrderRow): Promise<void> {
  for (const item of order.items) {
    if (!item.productId) continue;
    await db.product.updateMany({
      where: { id: item.productId, stock: { not: null } },
      data: { stock: { increment: item.quantity } },
    });
  }
}
