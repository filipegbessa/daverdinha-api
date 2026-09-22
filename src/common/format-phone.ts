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
