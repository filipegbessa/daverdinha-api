import { Prisma } from '@prisma/client';

/**
 * A fronteira com o gateway de pagamento. Só `src/pagarme/` sabe que é o
 * Pagar.me; o resto da API depende desta interface, o que deixa os testes
 * sem rede e a troca de gateway (ou a V2, com pagamento dentro do site)
 * restrita a um módulo.
 */
export interface CheckoutInput {
  /** Nosso id do pedido; vai como código do comprador no gateway. */
  orderId: string;
  /** `DV-0001`: o código de correlação do link e o nome que aparece no checkout. */
  code: string;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
  }[];
  deliveryFee: Prisma.Decimal;
  customer: { name: string; email: string; phone: string };
  /** Pra onde o comprador volta depois de pagar (`<site>/pedido/<token>`). */
  successUrl: string;
  /** Parcelas sem juros oferecidas; 1 = só à vista. */
  maxInstallments: number;
  expiresAt: Date;
}

/** Status da cobrança já traduzido do vocabulário do gateway. */
export type GatewayChargeStatus =
  'pending' | 'paid' | 'failed' | 'canceled' | 'refunded' | 'chargedback';

export interface GatewayCharge {
  /** `ch_…` */
  id: string;
  /** `or_…`, o pedido do gateway que o link gerou. */
  orderId: string | null;
  /** O nosso `DV-0001`, quando o gateway o devolve na cobrança. */
  orderCode: string | null;
  status: GatewayChargeStatus;
  /** O que de fato foi pago, em centavos (0 enquanto não pago). */
  amountCents: number;
  paidAt: string | null;
  /** Status bruto do gateway, guardado no pedido pra conferência no admin. */
  rawStatus: string;
}

export interface PaymentGateway {
  createCheckout(
    input: CheckoutInput,
  ): Promise<{ gatewayLinkId: string; paymentUrl: string }>;
  getCharge(chargeId: string): Promise<GatewayCharge>;
  /**
   * Reconciliação sem webhook: as cobranças do pedido gerado pelo link, a
   * mais antiga primeiro. Vazio enquanto ninguém pagou.
   */
  findChargesForLink(
    gatewayLinkId: string,
    orderCode: string,
  ): Promise<GatewayCharge[]>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
