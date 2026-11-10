/**
 * O estado pra onde a conversa volta sempre que retorna ao bot: o bot-engine
 * (handoff antigo que expirou) e o "reativar" do admin usam o mesmo, pra
 * nenhum dos dois esquecer de zerar uma flag.
 */
export const BOT_ACTIVE_RESET = {
  status: 'bot_active',
  invalidAttempts: 0,
  awaitingDeliveryReply: false,
} as const;
