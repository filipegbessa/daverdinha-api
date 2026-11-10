/**
 * Formats a WhatsApp phone number (E.164-ish digits with no separators,
 * e.g. "5521984448130") as "+55 (21) 98444-8130". Falls back to the raw
 * input unchanged if it doesn't match the expected Brazilian shape
 * (country code 55 + 2-digit DDD + 8 or 9-digit local number).
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const match = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!match) return phone;
  const [, ddd, prefix, suffix] = match;
  return `+55 (${ddd}) ${prefix}-${suffix}`;
}

/**
 * Reduz ao formato exato que o webhook grava: código do país e dígitos, sem
 * `+` nem separadores (`5521984448130`). Tem que bater, porque a conversa é
 * achada por igualdade no `phone` (`BotEngineService.resolveConversation`):
 * um número salvo como `+55 21 98444-8130` viraria uma segunda conversa do
 * mesmo cliente. Serve pro import de histórico, pra busca do admin e pro
 * `customerPhone` do checkout.
 *
 * Número sem código do país (`(21) 98444-8130`, como o site manda e como vem
 * no export em pt-BR) ganha o `55`: DDD + 8 ou 9 dígitos não é ambíguo.
 * Devolve `null` pro que não tem cara de telefone.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (/^\d{10,11}$/.test(digits)) digits = `55${digits}`;
  return /^\d{12,15}$/.test(digits) ? digits : null;
}
