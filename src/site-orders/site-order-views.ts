import { Prisma } from '@prisma/client';
import { formatOrderCode } from './order-code';
import { toMoney } from '../common/money';
import type { StoreSettings } from '../store-settings/store-settings.service';

/** Itens (produtos), ingressos e o evento: tudo o que as duas vistas mostram. */
export const WITH_DETAILS = {
  items: { orderBy: { productName: 'asc' } },
  tickets: { orderBy: { attendeeName: 'asc' } },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      endsAt: true,
      locationName: true,
      locationAddress: true,
    },
  },
} as const satisfies Prisma.SiteOrderInclude;

export type SiteOrderRow = Prisma.SiteOrderGetPayload<{
  include: typeof WITH_DETAILS;
}>;

/**
 * O que a página pública do pedido (`/pedido/<token>`) mostra. Quem tem o
 * link vê o pedido, então nada de rua, número, telefone nem e-mail.
 */
export interface PublicSiteOrder {
  code: string;
  kind: 'products' | 'tickets';
  status: SiteOrderRow['status'];
  fulfillmentStatus: SiteOrderRow['fulfillmentStatus'];
  items: {
    name: string;
    slug: string | null;
    unitPrice: number;
    quantity: number;
    imageUrl: string | null;
    leadTimeDays: number | null;
  }[];
  /** Só em pedido de ingresso. */
  event: {
    title: string;
    slug: string;
    startsAt: string;
    endsAt: string;
    locationName: string | null;
    locationAddress: string | null;
  } | null;
  /** Um por participante; `[]` em pedido de produtos. */
  tickets: { attendeeName: string; unitPrice: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryMethod: 'pickup' | 'delivery' | null;
  bairro: string | null;
  pickup: {
    address: string;
    hours: string;
    instructions: string | null;
  } | null;
  paymentUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

/** O pedido inteiro, pro admin. */
export interface SiteOrderAdmin {
  id: string;
  code: string;
  kind: 'products' | 'tickets';
  status: SiteOrderRow['status'];
  fulfillmentStatus: SiteOrderRow['fulfillmentStatus'];
  customer: { name: string; email: string; phone: string };
  deliveryMethod: 'pickup' | 'delivery' | null;
  address: {
    cep: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    bairro: string | null;
    zone: string | null;
    area: string | null;
  } | null;
  notes: string | null;
  items: {
    productId: string | null;
    name: string;
    slug: string | null;
    unitPrice: number;
    quantity: number;
    imageUrl: string | null;
    leadTimeDays: number | null;
  }[];
  /** Só em pedido de ingresso. */
  event: { id: string; title: string; slug: string; startsAt: string } | null;
  tickets: {
    id: string;
    attendeeName: string;
    unitPrice: number;
    checkedInAt: string | null;
  }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  payment: {
    linkId: string | null;
    orderId: string | null;
    chargeId: string | null;
    status: string | null;
  };
  paymentUrl: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
}

function items(row: SiteOrderRow) {
  return row.items.map((item) => ({
    name: item.productName,
    slug: item.productSlug,
    unitPrice: toMoney(item.unitPrice),
    quantity: item.quantity,
    imageUrl: item.imageUrl,
    leadTimeDays: item.leadTimeDays,
  }));
}

export function toPublicOrder(
  row: SiteOrderRow,
  settings: Pick<
    StoreSettings,
    'pickupAddress' | 'pickupHours' | 'pickupInstructions'
  >,
): PublicSiteOrder {
  return {
    code: formatOrderCode(row.number),
    kind: row.kind,
    status: row.status,
    fulfillmentStatus: row.fulfillmentStatus,
    items: items(row),
    event: row.event && {
      title: row.event.title,
      slug: row.event.slug,
      startsAt: row.event.startsAt.toISOString(),
      endsAt: row.event.endsAt.toISOString(),
      locationName: row.event.locationName,
      locationAddress: row.event.locationAddress,
    },
    tickets: row.tickets.map((ticket) => ({
      attendeeName: ticket.attendeeName,
      unitPrice: toMoney(ticket.unitPrice),
    })),
    subtotal: toMoney(row.subtotal),
    deliveryFee: toMoney(row.deliveryFee),
    total: toMoney(row.total),
    deliveryMethod: row.deliveryMethod,
    bairro: row.bairro,
    pickup:
      row.deliveryMethod === 'pickup'
        ? {
            address: settings.pickupAddress,
            hours: settings.pickupHours,
            instructions: settings.pickupInstructions,
          }
        : null,
    paymentUrl: row.status === 'pending_payment' ? row.paymentUrl : null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAdminOrder(row: SiteOrderRow): SiteOrderAdmin {
  return {
    id: row.id,
    code: formatOrderCode(row.number),
    kind: row.kind,
    status: row.status,
    fulfillmentStatus: row.fulfillmentStatus,
    customer: {
      name: row.customerName,
      email: row.customerEmail,
      phone: row.customerPhone,
    },
    deliveryMethod: row.deliveryMethod,
    address:
      row.deliveryMethod === 'delivery'
        ? {
            cep: row.cep,
            street: row.street,
            number: row.streetNumber,
            complement: row.complement,
            bairro: row.bairro,
            zone: row.deliveryZone,
            area: row.deliveryArea,
          }
        : null,
    notes: row.notes,
    items: items(row).map((item, index) => ({
      productId: row.items[index].productId,
      ...item,
    })),
    event: row.event && {
      id: row.event.id,
      title: row.event.title,
      slug: row.event.slug,
      startsAt: row.event.startsAt.toISOString(),
    },
    tickets: row.tickets.map((ticket) => ({
      id: ticket.id,
      attendeeName: ticket.attendeeName,
      unitPrice: toMoney(ticket.unitPrice),
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
    })),
    subtotal: toMoney(row.subtotal),
    deliveryFee: toMoney(row.deliveryFee),
    total: toMoney(row.total),
    payment: {
      linkId: row.gatewayLinkId,
      orderId: row.gatewayOrderId,
      chargeId: row.gatewayChargeId,
      status: row.gatewayStatus,
    },
    paymentUrl: row.paymentUrl,
    paidAt: row.paidAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
