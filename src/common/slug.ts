import { normalizeText } from './normalize-text';

/**
 * "Kit Jardinagem (iniciante)!" → "kit-jardinagem-iniciante". Mesma
 * normalização que o bot usa pra comparar texto, com hífen no lugar do
 * espaço. Um nome sem nenhuma letra ou número vira "item", pra nunca gerar
 * uma URL vazia.
 */
export function slugify(name: string): string {
  return normalizeText(name).replace(/ /g, '-') || 'item';
}

/**
 * O slug do nome, ou o primeiro de `-2`, `-3`… que estiver livre. Checar
 * antes não fecha a corrida entre duas criações simultâneas — por isso quem
 * chama ainda trata o P2002 no slug.
 */
export async function uniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let n = 2; await isTaken(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
