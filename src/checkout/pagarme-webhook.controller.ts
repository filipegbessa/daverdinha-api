import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SiteOrdersService } from '../site-orders/site-orders.service';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../pagarme/payment-gateway';
import { isValidWebhookAuth } from '../pagarme/webhook-auth';

/**
 * O id da cobrança que o aviso menciona. `charge.*` traz a cobrança em
 * `data`; `order.*` (o que a skill do Pagar.me recomenda assinar: `order.paid`,
 * `order.payment_failed`) traz o pedido, com as cobranças dentro — vale a
 * última; `chargeback.*` traz o chargeback, com a cobrança dentro. O resto
 * (`checkout.*`) é ignorado: o vencimento é nosso.
 */
export function extractChargeId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const hook = body as {
    type?: unknown;
    event?: unknown;
    data?: {
      id?: unknown;
      charge?: { id?: unknown };
      charges?: { id?: unknown }[];
    };
  };
  const type = typeof hook.type === 'string' ? hook.type : hook.event;
  if (typeof type !== 'string') return null;
  let id: unknown = null;
  if (type.startsWith('charge.')) id = hook.data?.id;
  else if (type.startsWith('chargeback.')) id = hook.data?.charge?.id;
  else if (type.startsWith('order.') && Array.isArray(hook.data?.charges)) {
    id = hook.data.charges[hook.data.charges.length - 1]?.id;
  }
  return typeof id === 'string' && id ? id : null;
}

/**
 * Aviso do Pagar.me. É só um aviso: o status vem sempre de `getCharge`, nunca
 * do corpo, então um aviso forjado não marca pedido como pago. Responde 200
 * pra tudo que passou na autenticação (pedido desconhecido, evento ignorado,
 * aviso repetido), senão o Pagar.me reenvia; erro ao consultar o Pagar.me
 * vira 500, e aí o reenvio é bem-vindo.
 */
@ApiExcludeController()
@Controller('webhooks/pagarme')
export class PagarmeWebhookController {
  constructor(
    private readonly orders: SiteOrdersService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    // Objeto solto de propósito: um DTO com `whitelist` apagaria os campos.
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const valid = isValidWebhookAuth(
      authorization,
      process.env.PAGARME_WEBHOOK_USER ?? '',
      process.env.PAGARME_WEBHOOK_PASSWORD ?? '',
    );
    if (!valid) throw new UnauthorizedException();
    const chargeId = extractChargeId(body);
    if (!chargeId) return;
    const charge = await this.gateway.getCharge(chargeId);
    await this.orders.applyGatewayCharge(charge);
  }
}
