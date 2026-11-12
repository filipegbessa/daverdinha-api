import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
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
import type { CreateTicketCheckoutDto } from '../checkout/dto/create-ticket-checkout.dto';
import { lockEvent, spotsLeft, takenSpots } from './spots';
import { generateTicketCode, normalizeTicketCode } from './ticket-code';
import { isUniqueViolation } from '../common/prisma-errors';
import { formatOrderCode, parseOrderCode } from './order-code';
import { normalizePhone } from '../common/format-phone';
import {
  PAYMENT_GATEWAY,
  type CheckoutInput,
  type GatewayCharge,
  type PaymentGateway,
} from '../pagarme/payment-gateway';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { EmailService } from '../email/email.service';
import { orderConfirmationEmail } from '../email/templates/order-confirmation';
import { orderLinksEmail } from '../email/templates/order-links';
import {
  toAdminOrder,
  toPublicOrder,
  WITH_DETAILS,
  type PublicSiteOrder,
  type SiteOrderAdmin,
  type SiteOrderRow,
} from './site-order-views';
import type { ListSiteOrdersDto } from './dto/list-site-orders.dto';
import type { UpdateFulfillmentDto } from './dto/update-fulfillment.dto';
import type { ListAttendeesDto } from './dto/list-attendees.dto';

/** Cliente do Prisma ou transação: a cotação roda dentro da criação do pedido. */
type Db = Prisma.TransactionClient;

export type QuoteProblem = {
  productId: string;
  reason: 'not_found' | 'inactive' | 'insufficient_stock';
  /** Só em `insufficient_stock`: quantas unidades dá pra comprar (0 = esgotado). */
  available?: number;
};

/** Participante na lista de presença do admin. */
export interface Attendee {
  id: string;
  attendeeName: string;
  checkedInAt: string | null;
  order: {
    id: string;
    code: string;
    customerName: string;
    customerPhone: string;
  };
}

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

/** "Meus pedidos": tentativas por hora, por e-mail e por IP. */
const LOOKUP_LIMIT_PER_EMAIL = 3;
const LOOKUP_LIMIT_PER_IP = 20;

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
    private readonly email: EmailService,
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
        include: WITH_DETAILS,
      });
    });

    const paymentUrl = await this.startPayment(
      order,
      order.items.map((item) => ({
        id: item.productId ?? item.id,
        description: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );
    return {
      code: formatOrderCode(order.number),
      token: order.publicToken,
      paymentUrl,
    };
  }

  /**
   * Compra de ingresso (ou inscrição gratuita) de um evento. A vaga é contada
   * com o evento travado, como o estoque na compra de produto, e o preço vem
   * do banco, congelado em cada ingresso. Gratuito não passa pelo gateway: já
   * nasce pago e avisa a cliente na hora.
   */
  async createTickets(
    dto: CreateTicketCheckoutDto,
    now: Date = new Date(),
  ): Promise<{ code: string; token: string; paymentUrl: string | null }> {
    if (!(await this.storeSettings.get()).ticketsEnabled) {
      throw new ConflictException({
        message: 'A venda de ingressos pelo site está fechada no momento.',
        reason: 'tickets_closed',
      });
    }
    const phone = normalizePhone(dto.customer.phone);
    if (!phone) throw new BadRequestException('Telefone inválido.');
    const quantity = dto.attendees.length;

    // Código de ingresso repetido (P2002) é quase impossível; se acontecer,
    // tenta de novo com outros códigos.
    const order = await retryOnUniqueCode(() =>
      this.prisma.$transaction(async (tx) => {
        await lockEvent(tx, dto.eventId);
        const event = await tx.event.findUnique({ where: { id: dto.eventId } });
        if (
          !event ||
          !event.published ||
          !event.ticketSales ||
          event.startsAt <= now
        ) {
          throw new ConflictException({
            message: 'As vendas desse evento foram encerradas.',
            reason: 'not_available',
          });
        }
        if (quantity > event.maxTicketsPerOrder) {
          throw new ConflictException({
            message: `O máximo por compra é ${event.maxTicketsPerOrder} ingressos.`,
            reason: 'too_many',
            max: event.maxTicketsPerOrder,
          });
        }
        const left = spotsLeft(
          event.spots,
          (await takenSpots(tx, [event.id], now)).get(event.id),
        );
        if (left !== null && left < quantity) {
          throw new ConflictException({
            message: `Restam ${left} vagas.`,
            reason: 'sold_out',
            spotsLeft: left,
          });
        }
        // `null` ou 0 = gratuito.
        const unitPrice = new Prisma.Decimal(event.price ?? 0);
        const free = unitPrice.isZero();
        const { subtotal, total } = orderTotals(
          [lineTotal(unitPrice, quantity)],
          new Prisma.Decimal(0),
        );
        return tx.siteOrder.create({
          data: {
            kind: 'tickets',
            eventId: event.id,
            customerName: dto.customer.name.trim(),
            customerEmail: dto.customer.email.trim(),
            customerPhone: phone,
            deliveryMethod: null,
            notes: dto.notes?.trim() || null,
            subtotal,
            deliveryFee: new Prisma.Decimal(0),
            total,
            ...(free
              ? { status: 'paid', paidAt: now, expiresAt: now }
              : {
                  // A reserva não passa do começo do evento.
                  expiresAt: new Date(
                    Math.min(
                      now.getTime() + ORDER_TTL_MS,
                      event.startsAt.getTime(),
                    ),
                  ),
                }),
            tickets: {
              create: dto.attendees.map((attendee) => ({
                eventId: event.id,
                attendeeName: attendee.name.trim(),
                code: generateTicketCode(),
                unitPrice,
              })),
            },
          },
          include: WITH_DETAILS,
        });
      }),
    );

    const code = formatOrderCode(order.number);
    if (order.status === 'paid') {
      await this.onPaid(order, code);
      return { code, token: order.publicToken, paymentUrl: null };
    }
    const paymentUrl = await this.startPayment(order, [
      {
        id: order.eventId!,
        description: `Ingresso — ${order.event!.title}`,
        quantity,
        unitPrice: order.tickets[0].unitPrice,
      },
    ]);
    return { code, token: order.publicToken, paymentUrl };
  }

  /**
   * Cria o link de pagamento de um pedido recém-gravado, fora da transação.
   * Se o gateway falhar, o pedido é cancelado na hora (a reserva some) e o
   * site recebe 503.
   */
  private async startPayment(
    order: SiteOrderRow,
    items: CheckoutInput['items'],
  ): Promise<string> {
    const code = formatOrderCode(order.number);
    const settings = await this.storeSettings.get();
    try {
      const { gatewayLinkId, paymentUrl } = await this.gateway.createCheckout({
        orderId: order.id,
        code,
        items,
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
      return paymentUrl;
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
        await this.onPaid(
          order,
          code,
          order.status === 'expired' || order.status === 'cancelled',
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
      include: WITH_DETAILS,
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
      ...(query.eventId && { eventId: query.eventId }),
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
        include: WITH_DETAILS,
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
        include: WITH_DETAILS,
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

  /**
   * Lista de presença: ingressos de pedidos pagos, por nome do participante.
   * `q` acha pelo participante ou pelo comprador. Paginada, porque um evento
   * pode ter muita gente.
   */
  async listAttendees(eventId: string, query: ListAttendeesDto = {}) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spots: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    const { page, perPage, skip, take } = pageBounds(query);
    const search = query.q?.trim();
    const where: Prisma.SiteOrderTicketWhereInput = {
      eventId,
      order: { status: 'paid' },
      ...(search && {
        OR: [
          { attendeeName: { contains: search, mode: 'insensitive' } },
          {
            order: {
              customerName: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
    const [rows, total, sold] = await Promise.all([
      this.prisma.siteOrderTicket.findMany({
        where,
        include: WITH_ATTENDEE_ORDER,
        orderBy: [{ attendeeName: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.siteOrderTicket.count({ where }),
      this.prisma.siteOrderTicket.count({
        where: { eventId, order: { status: 'paid' } },
      }),
    ]);
    return {
      ...paginated(rows.map(toAttendee), total, page, perPage),
      sold,
      spots: event.spots,
    };
  }

  /** Marca ou desmarca a presença. Só ingresso de pedido pago tem presença. */
  async setCheckIn(
    ticketId: string,
    checkedIn: boolean,
    now: Date = new Date(),
  ): Promise<Attendee> {
    const ticket = await this.prisma.siteOrderTicket.findUnique({
      where: { id: ticketId },
      include: WITH_ATTENDEE_ORDER,
    });
    if (!ticket) throw new NotFoundException('Ingresso não encontrado.');
    if (ticket.order.status !== 'paid') {
      throw new ConflictException('Esse ingresso não está pago.');
    }
    return toAttendee(
      await this.prisma.siteOrderTicket.update({
        where: { id: ticketId },
        data: { checkedInAt: checkedIn ? now : null },
        include: WITH_ATTENDEE_ORDER,
      }),
    );
  }

  /**
   * O que acontece quando um pedido acaba de virar pago: push pra cliente e
   * e-mail de confirmação pro comprador. Nada aqui derruba o pagamento.
   */
  private async onPaid(order: SiteOrderRow, code: string, late = false) {
    await Promise.all([
      this.notify(order, code, late),
      this.sendConfirmation(order.id),
    ]);
  }

  /**
   * Manda o e-mail de confirmação uma vez só por pedido. A marca
   * (`confirmationSentAt`) é gravada antes de enviar, com `updateMany`
   * condicionado, então dois webhooks ao mesmo tempo não mandam dois e-mails;
   * se o envio falhar (ou o e-mail não estiver configurado), a marca volta
   * pra `null` e o admin pode reenviar. `force` é o botão "Reenviar".
   */
  private async sendConfirmation(
    orderId: string,
    { force = false } = {},
  ): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.siteOrder.updateMany({
      where: {
        id: orderId,
        status: 'paid',
        ...(!force && { confirmationSentAt: null }),
      },
      data: { confirmationSentAt: now },
    });
    if (count === 0) return false;
    const release = () =>
      this.prisma.siteOrder.updateMany({
        where: { id: orderId, confirmationSentAt: now },
        data: { confirmationSentAt: null },
      });
    try {
      const [row, settings] = await Promise.all([
        this.findRow(orderId),
        this.storeSettings.get(),
      ]);
      const sent = await this.email.send(
        await orderConfirmationEmail(row, settings, siteUrl()),
      );
      if (!sent) await release();
      return sent;
    } catch (error) {
      this.logger.warn(
        `E-mail de confirmação do pedido ${orderId} falhou: ${(error as Error).message}`,
      );
      await release();
      return false;
    }
  }

  /** Botão "Reenviar confirmação" do admin: só pedido pago, mesmo que já tenha saído. */
  async resendConfirmation(id: string): Promise<SiteOrderAdmin> {
    const row = await this.findRow(id);
    if (row.status !== 'paid') {
      throw new ConflictException(
        'Só dá pra mandar a confirmação de um pedido pago.',
      );
    }
    if (!this.email.configured) {
      throw new ServiceUnavailableException(
        'O envio de e-mail ainda não está configurado.',
      );
    }
    if (!(await this.sendConfirmation(id, { force: true }))) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail agora. Tente de novo em instantes.',
      );
    }
    return toAdminOrder(await this.findRow(id));
  }

  /**
   * Check-in pelo QR do ingresso, na lista de presença de um evento. O
   * código é conferido contra o evento da tela, o pagamento e uma entrada
   * anterior; o check-in pelo nome (`setCheckIn`) continua existindo.
   */
  async checkInByCode(
    eventId: string,
    rawCode: string,
    now: Date = new Date(),
  ): Promise<Attendee> {
    const code = normalizeTicketCode(rawCode);
    const ticket = await this.prisma.siteOrderTicket.findUnique({
      where: { code },
      include: WITH_ATTENDEE_ORDER,
    });
    if (!ticket) throw new NotFoundException('Código não encontrado.');
    if (ticket.eventId !== eventId) {
      throw new ConflictException({
        message: 'Esse ingresso é de outro evento.',
        reason: 'other_event',
      });
    }
    if (ticket.order.status !== 'paid') {
      throw new ConflictException({
        message: 'Esse ingresso não está pago.',
        reason: 'not_paid',
      });
    }
    // Condicional: duas leituras do mesmo QR ao mesmo tempo marcam uma vez só.
    const { count } = await this.prisma.siteOrderTicket.updateMany({
      where: { id: ticket.id, checkedInAt: null },
      data: { checkedInAt: now },
    });
    if (count === 0) {
      const current = await this.prisma.siteOrderTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: { checkedInAt: true },
      });
      throw new ConflictException({
        message: 'Esse ingresso já entrou.',
        reason: 'already_checked_in',
        checkedInAt: current.checkedInAt?.toISOString() ?? null,
      });
    }
    return toAttendee({ ...ticket, checkedInAt: now });
  }

  /**
   * "Meus pedidos": manda pro e-mail os links dos pedidos pagos ou pendentes
   * dos últimos 12 meses. A resposta é sempre a mesma, com ou sem pedido, pra
   * ninguém descobrir quem comprou; o limite de tentativas (por e-mail e por
   * IP, numa tabela, porque serverless não guarda memória) segura abuso.
   */
  async sendOrderLinks(rawEmail: string, ip: string, now: Date = new Date()) {
    const email = rawEmail.trim().toLowerCase();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const keys = { email: `email:${email}`, ip: `ip:${ip}` };
    const [byEmail, byIp] = await Promise.all([
      this.prisma.lookupAttempt.count({
        where: { key: keys.email, createdAt: { gt: hourAgo } },
      }),
      this.prisma.lookupAttempt.count({
        where: { key: keys.ip, createdAt: { gt: hourAgo } },
      }),
    ]);
    if (byEmail >= LOOKUP_LIMIT_PER_EMAIL || byIp >= LOOKUP_LIMIT_PER_IP) {
      throw new HttpException(
        'Muitas tentativas. Tente de novo em uma hora.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.prisma.$transaction([
      this.prisma.lookupAttempt.createMany({
        data: [{ key: keys.email }, { key: keys.ip }],
      }),
      // Faxina: tentativa com mais de um dia não serve pra nada.
      this.prisma.lookupAttempt.deleteMany({
        where: {
          createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const orders = await this.prisma.siteOrder.findMany({
      where: {
        customerEmail: { equals: email, mode: 'insensitive' },
        createdAt: { gt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) },
        OR: [
          { status: 'paid' },
          { status: 'pending_payment', expiresAt: { gt: now } },
        ],
      },
      select: {
        number: true,
        publicToken: true,
        kind: true,
        status: true,
        total: true,
        createdAt: true,
        event: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (orders.length === 0) return;
    await this.email
      .send(
        orderLinksEmail(
          email,
          orders.map((order) => ({
            ...order,
            status: order.status as 'paid' | 'pending_payment',
            eventTitle: order.event?.title ?? null,
          })),
          siteUrl(),
        ),
      )
      .catch((error) =>
        this.logger.warn(`E-mail de "Meus pedidos" falhou: ${error}`),
      );
  }

  /** Push de venda nova; falha só vira log, nunca derruba o pagamento. */
  private async notify(order: SiteOrderRow, code: string, late = false) {
    await this.push
      .notifyNewOrder({
        id: order.id,
        code,
        total: order.total,
        customerName: order.customerName,
        late,
        ...(order.kind === 'tickets' && {
          tickets: {
            count: order.tickets.length,
            eventTitle: order.event?.title ?? 'evento',
          },
        }),
      })
      .catch((error) =>
        this.logger.warn(`Push do pedido ${code} falhou: ${error}`),
      );
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
      include: WITH_DETAILS,
    });
  }

  private async findRow(id: string): Promise<SiteOrderRow> {
    const row = await this.prisma.siteOrder.findUnique({
      where: { id },
      include: WITH_DETAILS,
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

/** Tenta de novo (até 3 vezes) quando um código de ingresso gerado já existia. */
async function retryOnUniqueCode<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt < 3 && isUniqueViolation(error, 'code')) continue;
      throw error;
    }
  }
}

const WITH_ATTENDEE_ORDER = {
  order: {
    select: {
      id: true,
      number: true,
      status: true,
      customerName: true,
      customerPhone: true,
    },
  },
} as const satisfies Prisma.SiteOrderTicketInclude;

function toAttendee(
  row: Prisma.SiteOrderTicketGetPayload<{
    include: typeof WITH_ATTENDEE_ORDER;
  }>,
): Attendee {
  return {
    id: row.id,
    attendeeName: row.attendeeName,
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    order: {
      id: row.order.id,
      code: formatOrderCode(row.order.number),
      customerName: row.order.customerName,
      customerPhone: row.order.customerPhone,
    },
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
