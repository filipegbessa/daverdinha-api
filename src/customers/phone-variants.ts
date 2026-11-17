/**
 * As formas que o mesmo celular brasileiro pode ter. O checkout grava o que
 * a compradora digita (`5521984448130`), mas o WhatsApp de números antigos
 * às vezes chega sem o nono dígito (`552184448130`), e a conversa fica com
 * esse. Pra ligar pedido e conversa, procura as duas formas.
 *
 * Fora do padrão `55 + DDD + 8 ou 9 dígitos`, devolve só o próprio número.
 */
export function phoneVariants(phone: string): string[] {
  const nine = phone.match(/^55(\d{2})9(\d{8})$/);
  if (nine) return [phone, `55${nine[1]}${nine[2]}`];
  // Oito dígitos começando em 6–9 é celular sem o nono dígito.
  const eight = phone.match(/^55(\d{2})([6-9]\d{7})$/);
  if (eight) return [phone, `55${eight[1]}9${eight[2]}`];
  return [phone];
}
