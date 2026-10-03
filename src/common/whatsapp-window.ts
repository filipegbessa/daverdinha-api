/**
 * WhatsApp only allows free-form ("session") replies within 24h of the
 * customer's last inbound message. Outside that window, only a
 * pre-approved template message can re-open the conversation.
 */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * `null` means no inbound message has ever arrived — also outside the
 * window, since there was never a session to begin with.
 */
export function isWindowExpired(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return true;
  return Date.now() - lastInboundAt.getTime() > WHATSAPP_WINDOW_MS;
}
