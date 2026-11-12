import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageBounds, paginated } from '../common/pagination';
import { toMoney } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { DeliveryAreasService } from '../delivery-locations/delivery-areas.service';
import { StoreSettingsService } from '../store-settings/store-settings.service';
import { installmentsFor } from '../store-settings/installments';
import { availableStock, lockProducts } from './stock';
import { lineTotal, orderTotals, toCents } from './pricing';
import type { CartItemDto } from '../checkout/dto/cart-item.dto';
import type { CreateCheckoutDto } from '../checkout/dto/create-checkout.dto';
import { formatOrderCode, parseOrderCode } from './order-code';
import { normalizePhone } from '../common/format-phone';
import {
  PAYMENT_GATEWAY,
  type GatewayCharge,
  type PaymentGateway,
} from '../pagarme/payment-gateway';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
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

/** Quanto tempo o pedido pendente (e o link de pagamento) seguram a reserva. */
export const ORDER_TTL_MS = 60 * 60 * 1000;
/** Intervalo mínimo entre duas consultas ao gateway pelo mesmo pedido. */
const SYNC_INTERVAL_MS = 60 * 1000;
const PAYMENT_UNAVAILABLE =
  'Não foi possível iniciar o pagamento. Tente de novo em instantes.';

@Injectable()
export class SiteOrdersService {
  private readonly logger = new Logger(SiteOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryLocations: DeliveryLocationsService,
    private readonly deliveryAreas: DeliveryAreasService,
    private readonly storeSettings: StoreSettingsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly push: PushNotificationsService,
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
   * momento. `delivery` já resolvido evita consultar o CEP (que pode ir à
   * BrasilAPI) com os produtos travados.
   */
  async quoteDetails(
    db: Db,
    items: CartItemDto[],
    cep?: string,
    now: Date = new Date(),
    delivery?: QuoteDetails['delivery'],
  ): Promise<QuoteDetails> {
    const merged = mergeItems(items);
    const ids = [...merged.keys()];
    const [products, stockLeft, settings, resolvedDelivery] = await Promise.all(
      [
        db.product.findMany({
          where: { id: { in: ids } },
          include: { category: { select: { active: true } } },
        }),
        availableStock(db, ids, now),
        this.storeSettings.get(),
        delivery ?? this.deliveryFor(cep),
      ],
    );

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
      delivery: resolvedDelivery,
      problems,
    };
  }

  /**
   * Cria o pedido e o link de pagamento. Os produtos ficam travados só
   * enquanto a cotação é refeita e o pedido gravado; a chamada ao gateway
   * vem depois, fora da transação. Se o gateway falhar, o pedido é
   * cancelado na hora (a reserva some) e o site recebe 503.
   */
  async create(
    dto: CreateCheckoutDto,
    now: Date = new Date(),
  ): Promise<{ code: string; token: string; paymentUrl: string }> {
    if (!(await this.storeSettings.get()).storeEnabled) {
      throw new ConflictException({
        message:
          'A loja do site está fechada no momento. Fale com a gente pelo WhatsApp.',
        reason: 'store_closed',
      });
    }
    const phone = normalizePhone(dto.customer.phone);
    if (!phone) throw new BadRequestException('Telefone inválido.');
    const isDelivery = dto.deliveryMethod === 'delivery';
    const address = isDelivery ? dto.address : undefined;
    // Resolvido antes de travar: o CEP pode depender de uma chamada externa.
    const delivery: QuoteDetails['delivery'] = address
      ? await this.deliveryFor(address.cep)
      : { available: false, reason: 'no_cep' };

    const order = await this.prisma.$transaction(async (tx) => {
      await lockProducts(tx, [...new Set(dto.items.map((i) => i.productId))]);
      const quote = await this.quoteDetails(
        tx,
        dto.items,
        address?.cep,
        now,
        delivery,
      );
      if (quote.problems.length > 0) {
        throw new ConflictException({
          message: 'Alguns produtos do carrinho mudaram. Confira o carrinho.',
          problems: quote.problems,
        });
      }
      if (isDelivery && !quote.delivery.available) {
        throw new UnprocessableEntityException({
          message: 'Não entregamos nesse endereço.',
          reason: quote.delivery.reason,
        });
      }
      if (!isDelivery && !quote.pickup.available) {
        throw new UnprocessableEntityException({
          message: 'A retirada não está disponível no momento.',
          reason: 'pickup_disabled',
        });
      }
      const fee = quote.delivery.available
        ? quote.delivery.fee
        : new Prisma.Decimal(0);
      const deliveryFee = isDelivery ? fee : new Prisma.Decimal(0);
      const { subtotal, total } = orderTotals(
        quote.lines.map((l) => l.lineTotal),
        deliveryFee,
      );
      const area =
        isDelivery && quote.delivery.available ? quote.delivery : null;
      return tx.siteOrder.create({
        data: {
          kind: 'products',
          customerName: dto.customer.name.trim(),
          customerEmail: dto.customer.email.trim(),
          customerPhone: phone,
          deliveryMethod: dto.deliveryMethod,
          ...(address && {
            cep: address.cep.replace(/\D/g, ''),
            street: address.street.trim(),
            streetNumber: address.number.trim(),
            complement: address.complement?.trim() || null,
          }),
          bairro: area?.bairro ?? null,
          deliveryZone: area?.zone ?? null,
          deliveryArea: area?.area ?? null,
          notes: dto.notes?.trim() || null,
          subtotal,
          deliveryFee,
          total,
          expiresAt: new Date(now.getTime() + ORDER_TTL_MS),
          items: {
            create: quote.lines.map((line) => ({
              productId: line.product.id,
              productName: line.product.name,
              productSlug: line.product.slug,
              imageUrl: line.product.images[0] ?? null,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              leadTimeDays:
                line.product.stock === null ? line.product.leadTimeDays : null,
            })),
          },
        },
        include: WITH_ITEMS,
      });
    });

    const code = formatOrderCode(order.number);
    const settings = await this.storeSettings.get();
    try {
      const { gatewayLinkId, paymentUrl } = await this.gateway.createCheckout({
        orderId: order.id,
        code,
        items: order.items.map((item) => ({
          id: item.productId ?? item.id,
          description: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        deliveryFee: order.deliveryFee,
        customer: {
          name: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone,
        },
        successUrl: `${siteUrl()}/pedido/${order.publicToken}`,
        maxInstallments: installmentsFor(order.total, settings),
        expiresAt: order.expiresAt,
      });
      await this.prisma.siteOrder.update({
        where: { id: order.id },
        data: { gatewayLinkId, paymentUrl },
      });
      return { code, token: order.publicToken, paymentUrl };
    } catch (error) {
      this.logger.error(
        `Falha ao criar o pagamento de ${code}: ${(error as Error).message}`,
      );
      await this.prisma.siteOrder.updateMany({
        where: { id: order.id, status: 'pending_payment' },
        data: { status: 'cancelled' },
      });
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
  }

  /**
   * Aplica ao pedido o status de uma cobrança lida no gateway (nunca o corpo
   * do webhook). Idempotente: o mesmo `paid` chegando várias vezes produz uma
   * baixa de estoque e um push, porque só quem consegue a transição pra
   * `paid` dispara os efeitos. Cobrança que não é nossa é ignorada.
   */
  async applyGatewayCharge(charge: GatewayCharge): Promise<void> {
    const order = await this.findByCharge(charge);
    if (!order) {
      this.logger.warn(
        `Cobrança ${charge.id} sem pedido nosso (pedido ${charge.orderId ?? '-'}, código ${charge.orderCode ?? '-'}).`,
      );
      return;
    }
    const code = formatOrderCode(order.number);
    const base: Prisma.SiteOrderUpdateManyMutationInput = {
      gatewayStatus: charge.rawStatus,
      ...(charge.orderId &&
        !order.gatewayOrderId && { gatewayOrderId: charge.orderId }),
    };

    switch (charge.status) {
      case 'paid': {
        if (charge.amountCents !== toCents(order.total)) {
          this.logger.error(
            `${code}: valor pago (${charge.amountCents} centavos) diferente do total (${toCents(order.total)}). Pedido não marcado como pago.`,
          );
          await this.prisma.siteOrder.updateMany({
            where: { id: order.id },
            data: base,
          });
          return;
        }
        const paid = await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.siteOrder.updateMany({
            where: { id: order.id, status: { not: 'paid' } },
            data: {
              ...base,
              status: 'paid',
              paidAt: charge.paidAt ? new Date(charge.paidAt) : new Date(),
              gatewayChargeId: charge.id,
            },
          });
          if (count === 1 && order.kind === 'products') {
            await takeStock(tx, order);
          }
          return count === 1;
        });
        if (!paid) {
          await this.prisma.siteOrder.updateMany({
            where: { id: order.id },
            data: base,
          });
          return;
        }
        await this.push
          .notifyNewOrder({
            id: order.id,
            code,
            total: order.total,
            customerName: order.customerName,
            late: order.status === 'expired' || order.status === 'cancelled',
          })
          .catch((error) =>
            this.logger.warn(`Push do pedido ${code} falhou: ${error}`),
          );
        return;
      }
      case 'refunded':
      case 'chargedback': {
        if (order.status === 'refunded') {
          await this.prisma.siteOrder.updateMany({
            where: { id: order.id },
            data: base,
          });
          return;
        }
        await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.siteOrder.updateMany({
            where: { id: order.id, status: order.status },
            data: { ...base, status: 'refunded' },
          });
          if (
            count === 1 &&
            order.status === 'paid' &&
            order.kind === 'products'
          ) {
            await returnStock(tx, order);
          }
        });
        return;
      }
      default:
        // pending, failed, canceled: o cliente pode tentar de novo até vencer.
        await this.prisma.siteOrder.updateMany({
          where: { id: order.id },
          data: base,
        });
    }
  }

  /**
   * Reconciliação sem cron: consulta o gateway pelas cobranças do link e
   * aplica cada uma. Sem `force`, só pedido pendente e no máximo uma vez por
   * minuto; falha do gateway não derruba quem está lendo o pedido. Com
   * `force` (botão do admin), consulta sempre e a falha vira 503.
   */
  async syncWithGateway(
    row: SiteOrderRow,
    { force = false, now = new Date() } = {},
  ): Promise<SiteOrderRow> {
    if (!row.gatewayLinkId) return row;
    if (!force) {
      if (row.status !== 'pending_payment') return row;
      if (
        row.lastSyncedAt &&
        now.getTime() - row.lastSyncedAt.getTime() < SYNC_INTERVAL_MS
      ) {
        return row;
      }
    }
    try {
      const charges = await this.gateway.findChargesForLink(
        row.gatewayLinkId,
        formatOrderCode(row.number),
      );
      for (const charge of charges) await this.applyGatewayCharge(charge);
      await this.prisma.siteOrder.updateMany({
        where: { id: row.id },
        data: { lastSyncedAt: now },
      });
    } catch (error) {
      this.logger.warn(
        `Não deu pra consultar o pagamento de ${formatOrderCode(row.number)}: ${(error as Error).message}`,
      );
      if (force) {
        throw new ServiceUnavailableException(
          'Não foi possível consultar o Pagar.me agora. Tente de novo em instantes.',
        );
      }
      return row;
    }
    return this.findRow(row.id);
  }

  /** Botão "Atualizar pagamento" do admin: consulta o gateway agora. */
  async sync(id: string): Promise<SiteOrderAdmin> {
    const row = await this.syncWithGateway(await this.findRow(id), {
      force: true,
    });
    return toAdminOrder(await this.expireIfDue(row));
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
      this.syncWithGateway(row).then((synced) => this.expireIfDue(synced)),
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
    const row = await this.syncWithGateway(await this.findRow(id));
    return toAdminOrder(await this.expireIfDue(row));
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

  /** O pedido de uma cobrança: pelo pedido do gateway ou pelo nosso `DV-…`. */
  private async findByCharge(
    charge: GatewayCharge,
  ): Promise<SiteOrderRow | null> {
    const or: Prisma.SiteOrderWhereInput[] = [];
    if (charge.orderId) or.push({ gatewayOrderId: charge.orderId });
    const number =
      charge.orderCode && /^DV-\d+$/i.test(charge.orderCode.trim())
        ? parseOrderCode(charge.orderCode)
        : null;
    if (number !== null) or.push({ number });
    if (or.length === 0) return null;
    return this.prisma.siteOrder.findFirst({
      where: { OR: or },
      include: WITH_ITEMS,
    });
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

/** Base do link de volta do pagamento (`<site>/pedido/<token>`). */
function siteUrl(): string {
  return (process.env.SITE_URL || 'https://www.daverdinha.com.br').replace(
    /\/$/,
    '',
  );
}

/** Baixa do estoque as unidades de um pedido que acabou de ser pago. */
async function takeStock(db: Db, order: SiteOrderRow): Promise<void> {
  for (const item of order.items) {
    if (!item.productId) continue;
    await db.product.updateMany({
      where: { id: item.productId, stock: { not: null } },
      data: { stock: { decrement: item.quantity } },
    });
  }
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
