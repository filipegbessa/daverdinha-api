/** O número do pedido como a cliente e o comprador falam: `42` → `DV-0042`. */
export function formatOrderCode(number: number): string {
  return `DV-${String(number).padStart(4, '0')}`;
}

/**
 * O número por trás de um código digitado na busca do admin: aceita
 * `DV-0042`, `dv42`, `0042` ou `42`. `null` quando não parece um código.
 */
export function parseOrderCode(text: string): number | null {
  const match = /^(?:dv-?)?0*(\d{1,9})$/i.exec(text.trim());
  return match ? Number(match[1]) : null;
}
