import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { toCents } from '../site-orders/pricing';
import type {
  CheckoutInput,
  GatewayCharge,
  GatewayChargeStatus,
  PaymentGateway,
} from './payment-gateway';

const PRODUCTION_URL = 'https://api.pagar.me/core/v5';
/** Nome na fatura do cartão (até 13 caracteres). */
const STATEMENT_DESCRIPTOR = 'DAVERDINHA';
/** O valor que a skill de integração do Pagar.me pede em toda chamada. */
const USER_AGENT = 'pagarme-skill-generated/1.0';

/** O pedaço da cobrança do Pagar.me que a API lê. */
interface PagarmeCharge {
  id: string;
  code?: string | null;
  status: string;
  amount?: number;
  paid_amount?: number | null;
  paid_at?: string | null;
  order?: { id?: string | null; code?: string | null } | null;
}

interface PagarmeOrder {
  id: string;
  code?: string | null;
  charges?: PagarmeCharge[] | null;
}

/** Erro de chamada ao Pagar.me. A mensagem nunca leva a chave. */
export class PagarmeError extends Error {}

/**
 * O único lugar que fala com o Pagar.me (API REST v5 via `fetch`, sem SDK).
 * Checkout hospedado por link de pagamento: o comprador paga em
 * `checkout.pagar.me` e volta pra página do pedido no site.
 *
 * Sem `PAGARME_SECRET_KEY` o módulo sobe do mesmo jeito (como o push sem
 * VAPID): só as chamadas falham, com 503 — a API inteira não pode cair por
 * falta da credencial da loja.
 */
@Injectable()
export class PagarmeService implements PaymentGateway {
  private readonly logger = new Logger(PagarmeService.name);

  async createCheckout(
    input: CheckoutInput,
  ): Promise<{ gatewayLinkId: string; paymentUrl: string }> {
    const now = Date.now();
    const secondsLeft = Math.max(
      60,
      Math.ceil((input.expiresAt.getTime() - now) / 1000),
    );
    const itemsCents = input.items.reduce(
      (sum, item) => sum + toCents(item.unitPrice) * item.quantity,
      0,
    );
    const totalCents = itemsCents + toCents(input.deliveryFee);
    const logo = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, '')}/logo-circle.png`
      : undefined;

    const body = {
      type: 'order',
      name: `Pedido ${input.code}`.slice(0, 64),
      order_code: input.code,
      // Minutos no link, segundos no Pix: os dois vencem junto com o pedido.
      expires_in: Math.ceil(secondsLeft / 60),
      max_paid_sessions: 1,
      payment_settings: {
        accepted_payment_methods: ['credit_card', 'pix'],
        statement_descriptor: STATEMENT_DESCRIPTOR,
        credit_card_settings: {
          operation_type: 'auth_and_capture',
          // Sem juros pro comprador: todas as parcelas oferecidas são "free".
          installments_setup: {
            max_installments: input.maxInstallments,
            amount: totalCents,
            free_installments: input.maxInstallments,
            interest_rate: 0,
            interest_type: 'simple',
          },
        },
        pix_settings: { expires_in: secondsLeft },
      },
      cart_settings: {
        items: input.items.map((item) => ({
          name: item.description.slice(0, 256),
          amount: toCents(item.unitPrice),
          default_quantity: item.quantity,
        })),
        ...(toCents(input.deliveryFee) > 0 && {
          shipping_cost: toCents(input.deliveryFee),
        }),
      },
      customer_settings: {
        customer: {
          code: input.orderId,
          name: input.customer.name.slice(0, 64),
          email: input.customer.email,
          type: 'individual',
          phones: { mobile_phone: splitPhone(input.customer.phone) },
        },
      },
      ...(logo && { layout_settings: { image_url: logo } }),
      flow_settings: { success_url: input.successUrl },
    };

    const link = await this.request<{ id: string; url: string }>(
      'POST',
      '/paymentlinks',
      body,
    );
    return { gatewayLinkId: link.id, paymentUrl: link.url };
  }

  async getCharge(chargeId: string): Promise<GatewayCharge> {
    const charge = await this.request<PagarmeCharge>(
      'GET',
      `/charges/${encodeURIComponent(chargeId)}`,
    );
    return toGatewayCharge(charge);
  }

  /**
   * O pedido que o link gerou, achado pelo `order_code` (`DV-0001`), e as
   * cobranças dele. A doc não descreve a resposta de `GET /paymentlinks/:id`,
   * por isso a busca é por `GET /orders?code=` — conferir no sandbox.
   */
  async findChargesForLink(
    _gatewayLinkId: string,
    orderCode: string,
  ): Promise<GatewayCharge[]> {
    const page = await this.request<{ data?: PagarmeOrder[] }>(
      'GET',
      `/orders?code=${encodeURIComponent(orderCode)}`,
    );
    return (page.data ?? [])
      .filter((order) => !order.code || order.code === orderCode)
      .flatMap((order) =>
        (order.charges ?? []).map((charge) =>
          toGatewayCharge({
            ...charge,
            order: { id: order.id, code: order.code ?? orderCode },
          }),
        ),
      );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const secretKey = process.env.PAGARME_SECRET_KEY;
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Pagamento não configurado (PAGARME_SECRET_KEY).',
      );
    }
    const baseUrl = (process.env.PAGARME_API_URL || PRODUCTION_URL).replace(
      /\/$/,
      '',
    );
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        // Basic Auth com a chave secreta como usuário e senha vazia.
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      this.logger.error(
        `Pagar.me ${method} ${path.split('?')[0]} -> ${response.status}: ${text.slice(0, 500)}`,
      );
      throw new PagarmeError(`Pagar.me respondeu ${response.status}.`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

/**
 * Traduz a cobrança. No Pagar.me, estornar uma cobrança paga a deixa
 * `canceled`; com `paid_at` preenchido isso é estorno, não cancelamento.
 * `overpaid`/`underpaid` contam como pagos, e a conferência do valor (no
 * `applyGatewayCharge`) decide o que fazer.
 */
export function toGatewayCharge(charge: PagarmeCharge): GatewayCharge {
  const paidAt = charge.paid_at ?? null;
  return {
    id: charge.id,
    orderId: charge.order?.id ?? null,
    orderCode: charge.order?.code ?? charge.code ?? null,
    status: normalizeStatus(charge.status, paidAt),
    amountCents: charge.paid_amount ?? 0,
    paidAt,
    rawStatus: charge.status,
  };
}

function normalizeStatus(
  status: string,
  paidAt: string | null,
): GatewayChargeStatus {
  switch (status) {
    case 'paid':
    case 'overpaid':
    case 'underpaid':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'canceled':
      return paidAt ? 'refunded' : 'canceled';
    case 'refunded':
      return 'refunded';
    case 'chargedback':
      return 'chargedback';
    default:
      // pending, processing e qualquer status novo: ainda não decidido.
      return 'pending';
  }
}

/** `5521999998888` → `{ country_code: '55', area_code: '21', number: '999998888' }`. */
export function splitPhone(phone: string): {
  country_code: string;
  area_code: string;
  number: string;
} {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  return {
    country_code: '55',
    area_code: local.slice(0, 2),
    number: local.slice(2),
  };
}
