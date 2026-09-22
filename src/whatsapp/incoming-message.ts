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
  type: string;
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
}

export function parseIncomingMessage(payload: unknown): IncomingMessage | null {
  const raw = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
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
  };
}
