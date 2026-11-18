import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { EmailService } from '../email/email.service';

/** O que deu errado. Cada tipo tem o próprio limite de avisos. */
export type AlertKind =
  | 'payment_link'
  | 'amount_mismatch'
  | 'confirmation_email'
  | 'webhook_auth'
  | 'unexpected_error';

export interface Alert {
  kind: AlertKind;
  /** Uma frase pra quem cuida da loja, sem jargão. */
  title: string;
  /** O detalhe técnico (mensagem do erro, código do pedido). */
  detail: string;
  /** Pra onde o push leva no admin. */
  url?: string;
}

/** Um aviso de cada tipo a cada 30 minutos: uma falha em série não vira enxurrada. */
export const ALERT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Avisa quando algo na venda falha em silêncio: o link de pagamento não
 * sai, o valor pago não bate, o webhook é recusado, o e-mail de confirmação
 * falha, ou um erro inesperado no checkout. Sem serviço novo: o aviso vai
 * pelo push do admin (o mesmo do pedido novo), por e-mail pra `ALERT_EMAIL`
 * quando configurado, e sempre pro log com `[ALERTA]`, que dá pra filtrar
 * nos logs da Vercel.
 *
 * O limite usa a tabela de tentativas (`lookup_attempts`, chave
 * `alert:<tipo>`), porque serverless não guarda memória entre chamadas.
 * Nunca lança: avisar não pode derrubar o que estava dando errado.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
    private readonly email: EmailService,
  ) {}

  async alert(alert: Alert, now: Date = new Date()): Promise<void> {
    this.logger.error(`[ALERTA] ${alert.kind}: ${alert.title} ${alert.detail}`);
    try {
      if (!(await this.claim(alert.kind, now))) return;
      await Promise.all([
        this.push
          .notifyAlert({
            title: `⚠️ ${alert.title}`,
            body: alert.detail,
            url: alert.url ?? '/admin',
          })
          .catch((error) =>
            this.logger.warn(`Push do alerta falhou: ${error}`),
          ),
        this.sendEmail(alert),
      ]);
    } catch (error) {
      this.logger.warn(`Alerta ${alert.kind} não enviado: ${error}`);
    }
  }

  /** `true` se ninguém avisou deste tipo nos últimos 30 minutos (e marca o aviso). */
  private async claim(kind: AlertKind, now: Date): Promise<boolean> {
    const key = `alert:${kind}`;
    const recent = await this.prisma.lookupAttempt.count({
      where: {
        key,
        createdAt: { gt: new Date(now.getTime() - ALERT_INTERVAL_MS) },
      },
    });
    if (recent > 0) return false;
    await this.prisma.lookupAttempt.create({ data: { key } });
    return true;
  }

  private async sendEmail(alert: Alert): Promise<void> {
    const to = process.env.ALERT_EMAIL;
    if (!to || !this.email.configured) return;
    const text = [
      alert.title,
      '',
      alert.detail,
      '',
      'Avisos do mesmo tipo ficam em silêncio por 30 minutos. Os detalhes estão nos logs da API na Vercel (procure por [ALERTA]).',
    ].join('\n');
    try {
      await this.email.send({
        to,
        subject: `[Daverdinha] ${alert.title}`,
        text,
        html: text
          .split('\n')
          .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ''))
          .join(''),
      });
    } catch (error) {
      this.logger.warn(`E-mail do alerta falhou: ${error}`);
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
