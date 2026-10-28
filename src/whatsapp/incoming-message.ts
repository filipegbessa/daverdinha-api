export interface OrderProductItem {
  product_retailer_id: string;
  quantity: string;
  item_price?: string;
  currency?: string;
}

/**
 * A customer message, flattened out of Meta's deeply nested webhook
 * envelope. The bot engine works with this shape only — knowing where Meta
 * happens to bury the payload is this module's job, not the bot's.
 */
export interface IncomingMessage {
  /** Meta's own `wamid`, globally unique — used to dedupe webhook retries. */
  id?: string;
  from: string;
  /**
   * Opcional porque o webhook não garante o campo — e os dois lugares que o
   * leem (`=== 'order'` e `isUnsupportedContent`) já tratam a ausência.
   */
  type?: string;
  text?: { body: string };
  interactive?: { list_reply?: { id: string; title?: string } };
  order?: { catalog_id?: string; product_items?: OrderProductItem[] };
  /**
   * Set when the customer opened the chat from a specific catalog product,
   * which is what tells us the conversation started at the catalog rather
   * than at the menu.
   */
  referredProductId?: string;
  /**
   * Set when the customer is replying to a specific message, containing
   * the wamid of the message being replied to.
   */
  repliedToWamid?: string;
  /**
   * The webhook never carries the photo itself — only an id that still has to
   * be exchanged for the file, in two authenticated calls, within five
   * minutes. See `WhatsAppClientService.downloadMedia`.
   *
   * `caption` deliberately stays here instead of being folded into `text`:
   * it's content to show the operator, never a command to the bot, and
   * keeping the two fields apart is what enforces that.
   */
  image?: {
    id: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
  };
  /**
   * Mesmo esquema da imagem: só um id a trocar pelo arquivo. Áudio não tem
   * legenda. `voice` marca a mensagem de voz gravada no app (`audio/ogg;
   * codecs=opus`), em oposição a um arquivo de áudio encaminhado.
   */
  audio?: {
    id: string;
    mime_type?: string;
    sha256?: string;
    voice?: boolean;
  };
}

/**
 * Meta's delivery receipt for a message we sent — `sent`/`delivered`/`read`,
 * or `failed` with why. The API accepting a send only means Meta queued it;
 * this is the only way to find out it never actually reached the customer.
 */
export interface MessageStatusUpdate {
  wamid: string;
  status: string;
  errors?: { code?: number; title?: string; message?: string; details?: string }[];
}

/**
 * O envelope da Meta, só até onde a gente lê. Descrever esta forma é o que
 * permite desembrulhar a mensagem sem espalhar acesso não verificado: tudo é
 * opcional de propósito, porque nada aqui é garantido pelo webhook.
 */
interface RawWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        messages?: (Partial<
          Omit<IncomingMessage, 'referredProductId' | 'repliedToWamid'>
        > & {
          context?: {
            id?: string;
            referred_product?: { product_retailer_id?: string };
          };
        })[];
        statuses?: {
          id?: string;
          status?: string;
          errors?: {
            code?: number;
            title?: string;
            message?: string;
            error_data?: { details?: string };
          }[];
        }[];
      };
    }[];
  }[];
}

export function parseIncomingMessage(payload: unknown): IncomingMessage | null {
  const raw = (payload as RawWebhookPayload)?.entry?.[0]?.changes?.[0]?.value
    ?.messages?.[0];
  if (!raw || typeof raw.from !== 'string') return null;

  return {
    id: raw.id,
    from: raw.from,
    type: raw.type,
    text: raw.text,
    interactive: raw.interactive,
    order: raw.order,
    referredProductId: raw.context?.referred_product?.product_retailer_id,
    repliedToWamid: raw.context?.id,
    image: raw.image,
    audio: raw.audio,
  };
}

export function parseMessageStatuses(payload: unknown): MessageStatusUpdate[] {
  const raw = (payload as RawWebhookPayload)?.entry?.[0]?.changes?.[0]?.value
    ?.statuses;
  if (!raw) return [];

  return raw
    .filter((s): s is typeof s & { id: string; status: string } =>
      typeof s.id === 'string' && typeof s.status === 'string',
    )
    .map((s) => ({
      wamid: s.id,
      status: s.status,
      errors: s.errors?.map((e) => ({
        code: e.code,
        title: e.title,
        message: e.message,
        details: e.error_data?.details,
      })),
    }));
}
