import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

/** Imagem embutida no corpo do e-mail (`<img src="cid:<contentId>">`), como o QR do ingresso. */
export interface InlineImage {
  contentId: string;
  filename: string;
  content: Buffer;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  images?: InlineImage[];
}

/** O envio falhou no Resend; quem chama decide se tenta de novo. */
export class EmailError extends Error {}

const DEFAULT_FROM = 'Daverdinha <contato@daverdinha.com.br>';

/**
 * E-mail transacional pelo Resend. Toda chamada ao Resend fica aqui, como o
 * Pagar.me em `src/pagarme/`. Sem `RESEND_API_KEY` (dev, testes, antes de o
 * domínio ser verificado) não envia nada: só loga, e devolve `false`.
 *
 * Remetente e resposta são o mesmo endereço por padrão (`contato@`): a
 * cliente só tem essa caixa.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;
  private readonly replyTo: string;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    this.client = key ? new Resend(key) : null;
    this.from = process.env.EMAIL_FROM || DEFAULT_FROM;
    this.replyTo = process.env.EMAIL_REPLY_TO || this.from;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /** `true` se o Resend aceitou; `false` se o envio está desligado (sem chave). */
  async send(email: OutgoingEmail): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(
        `E-mail não enviado (sem RESEND_API_KEY): "${email.subject}"`,
      );
      return false;
    }
    const { error } = await this.client.emails.send({
      from: this.from,
      replyTo: this.replyTo,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.images?.map((image) => ({
        filename: image.filename,
        content: image.content,
        contentId: image.contentId,
      })),
    });
    if (error) throw new EmailError(`${error.name}: ${error.message}`);
    return true;
  }
}
