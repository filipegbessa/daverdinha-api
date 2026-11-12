import * as crypto from 'crypto';

/** Sem 0/O, 1/I/L: o código também é digitado na mão, quando a câmera falha. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Código do ingresso, o que vai no QR: `K7Q2-M9XP`. Aleatório (31^8, perto
 * de um trilhão de combinações), nunca o número do pedido, que é sequencial.
 */
export function generateTicketCode(): string {
  const bytes = crypto.randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** O que a pessoa digitou ou o leitor leu, no formato gravado. */
export function normalizeTicketCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
