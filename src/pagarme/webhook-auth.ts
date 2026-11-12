import { timingSafeEqual } from 'node:crypto';

/**
 * Confere o Basic Auth que o painel do Pagar.me manda no webhook (usuário e
 * senha cadastrados no endpoint). Sem usuário ou senha configurados, recusa
 * sempre: webhook aberto por omissão deixaria qualquer um bater na rota.
 *
 * Mesmo autenticado, o corpo não decide nada: o status é sempre relido no
 * Pagar.me (`getCharge`). A autenticação só filtra o barulho.
 */
export function isValidWebhookAuth(
  authorizationHeader: string | undefined,
  user: string,
  password: string,
): boolean {
  if (!user || !password || !authorizationHeader) return false;
  const match = /^Basic\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  const received = Buffer.from(match[1], 'base64').toString('utf8');
  return safeEqual(received, `${user}:${password}`);
}

/** Comparação em tempo constante (o tamanho diferente já é recusa). */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
