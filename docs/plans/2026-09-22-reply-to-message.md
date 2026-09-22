# Responder mensagem citada (reply/quote do WhatsApp) — plano de implementação

> **Status:** plano, nada implementado. Escrito em 2026-09-22.
>
> **Ordem:** este plano roda **antes** do plano de imagens
> (`2026-09-22-image-handling.md`). O mecanismo de citação aqui construído
> (`context.message_id` no `WhatsAppClientService`) é genérico o bastante
> para a Tarefa 12/13 daquele plano reaproveitar de graça quando `sendImage`
> existir — mensagem de imagem também ganha `whatsappMessageId` e também
> vira citável, sem desenho novo.

**Objetivo:** quando o cliente usa o recurso nativo do WhatsApp de responder
citando uma mensagem específica, isso hoje chega solto — sem nenhum vínculo
com a mensagem original — e o operador não tem como responder citando uma
mensagem específica de volta. Este plano faz os dois sentidos funcionarem:
exibir a citação recebida vinculada no histórico do admin, e permitir que o
operador cite uma mensagem específica ao responder, virando uma citação de
verdade no WhatsApp do cliente (não só cosmética no nosso admin).

**Hoje:** nenhuma mensagem grava o próprio `wamid` (id da mensagem no
WhatsApp) em lugar nenhum — ele só passa pela claim temporária de dedupe de
webhook (`ProcessedWebhookMessage`, chave primária `whatsappMessageId`,
mantida em sucesso e removida só em falha pra permitir reentrega — ver
`bot-engine.service.ts:71-90`) e nunca chega a ser gravado na própria
`Message`. Sem isso guardado, não tem como saber qual mensagem interna um
`context.id` recebido está citando, nem como o operador citar uma mensagem
específica ao enviar.

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Sem preocupação com histórico anterior à feature.** O projeto está em produção só em teste — vai ser zerado antes do lançamento real. Nenhuma migração de dados, nenhum backfill de `wamid` de mensagens antigas. |
| 2 | **Citação não resolvida ainda mostra aviso genérico.** Se um `context.id` chegar apontando pra um wamid que não temos salvo (situação teórica após o zeramento: só pode acontecer se a claim de dedupe expirar/for limpa antes da gente salvar o wamid, ou em algum caso de borda futuro), a mensagem some da lista de "citável" mas o admin mostra "respondendo a uma mensagem anterior" em vez de te fingir que não era resposta a nada. |
| 3 | **Citação é metadado, nunca comando.** Mesma regra da legenda de imagem: `repliedToWamid`/`repliedToId` nunca entram no cálculo de `text` do bot engine. O bot não reage diferente a uma mensagem só porque ela citou outra. |
| 4 | **Só o operador cita ao responder — o bot não.** O bot nunca envia resposta citando uma mensagem específica; isso é conveniência humana. Não há caso de uso hoje para o bot citar, e adicionar isso seria escopo não pedido. |
| 5 | **Mensagem sem `whatsappMessageId` salvo não pode ser citada.** Em vez de tratar isso como erro, o botão "responder" no admin simplesmente não aparece nela. Depois do zeramento (decisão 1) isso praticamente não acontece, mas é a garantia natural para qualquer mensagem que por algum motivo não tenha vindo com wamid. |

---

## Restrições do projeto

- **Migration única:** ao mexer no `schema.prisma`, apagar a pasta de
  migration existente (`prisma/migrations/20260916124517_init`) e regenerar
  uma só.
- **Vercel serverless:** sem disco persistente, sem processo em background.
- **`ConversationMessengerService` é o único lugar autorizado a gravar
  mensagem** — qualquer gravação nova (wamid, citação) entra por ele, não por
  um atalho ao lado.
- Testes ficam ao lado do arquivo testado, dentro de `src/` (`rootDir: 'src'`).
- Sem trailer de commit (`Co-Authored-By`/`Claude-Session`).
- Staging de arquivo por nome (`git add <file> <file>`), nunca `-A`/`.`.

---

## Tarefas

### Tarefa 1 — Schema (backend)

**Arquivo:** `prisma/schema.prisma`

- [ ] Em `Message`, adicionar três colunas anuláveis:
  ```prisma
  whatsappMessageId String?  @unique @map("whatsapp_message_id")
  repliedToWamid    String?  @map("replied_to_wamid")
  repliedToId       String?  @map("replied_to_id")
  repliedTo         Message? @relation("MessageReplies", fields: [repliedToId], references: [id], onDelete: SetNull)
  replies           Message[] @relation("MessageReplies")
  ```
- [ ] Regenerar a migration única (apagar a pasta existente, `prisma migrate dev --name init`, conferir que o diff de produção é puramente aditivo — mesmo fluxo já usado no plano de quick-replies).

`whatsappMessageId` é o wamid da própria linha (preenchido daqui pra frente,
nos dois sentidos). `repliedToWamid` é o wamid citado, cru, sempre gravado
quando existir. `repliedToId` é a resolução em FK — setada só quando um
`Message.whatsappMessageId` bate com o `repliedToWamid`; do contrário fica
`null` e é o gatilho do aviso genérico (decisão 2).

### Tarefa 2 — Webhook: extrair a citação recebida

**Arquivo:** `src/whatsapp/incoming-message.ts`

- [ ] Adicionar `repliedToWamid?: string` à interface `IncomingMessage`,
      lido de `raw.context?.id` — campo irmão do `referred_product` que já é
      lido do mesmo objeto `context`, sem conflito entre os dois usos.

### Tarefa 3 — Cliente WhatsApp: citar ao enviar, capturar o wamid da resposta

**Arquivo:** `src/whatsapp/whatsapp-client.service.ts`

Hoje `post()` descarta o corpo da resposta em caso de sucesso, e `sendText`
não devolve nada. As duas coisas têm que mudar, porque toda mensagem de
saída — citando algo ou não — precisa do próprio wamid salvo, senão o
cliente nunca vai poder citá-la de volta.

- [ ] `post()` passa a devolver o JSON da resposta em vez de `void`.
- [ ] `sendText(to, body, options?: { replyToWamid?: string })` monta
      `context: { message_id: options.replyToWamid }` no payload quando
      presente, e devolve `{ whatsappMessageId: string }` lido de
      `messages[0].id` da resposta da Meta.
- [ ] `sendInteractiveList` também passa a devolver `{ whatsappMessageId }`
      pelo mesmo motivo (a lista do menu é mensagem de saída como qualquer
      outra — precisa ser citável).

### Tarefa 4 — `ConversationMessengerService`: gravar e resolver a citação

**Arquivo:** `src/messaging/conversation-messenger.service.ts`

- [ ] `recordInbound(conversationId, body, kind?, options?: { whatsappMessageId?: string; repliedToWamid?: string })`:
      resolve `repliedToId` fazendo `prisma.message.findFirst({ where: { whatsappMessageId: repliedToWamid } })`
      quando `repliedToWamid` vier presente, e grava as três colunas junto
      com a mensagem, dentro da mesma `persist()`/transação de sempre.
- [ ] `sendText(conversation, body, options?: { replyToMessageId?: string })`:
      quando `replyToMessageId` vier, busca essa mensagem (`whatsappMessageId`,
      erro claro se ela não tiver um — não pode citar o que não tem wamid),
      manda pro `whatsapp.sendText` com `replyToWamid`, e grava a nova
      mensagem já com `repliedToId = replyToMessageId` e
      `repliedToWamid` preenchidos direto (sem precisar resolver — já
      sabemos o id interno) mais o `whatsappMessageId` que voltou do envio.
- [ ] `sendMenu` também passa a gravar o `whatsappMessageId` que volta do
      envio (mesma razão da Tarefa 3 — toda saída precisa ser citável depois).

### Tarefa 5 — Bot engine: passar o wamid e a citação pros call sites existentes

**Arquivo:** `src/bot-engine/bot-engine.service.ts`

- [ ] Todo `this.messenger.recordInbound(...)` (linhas 121, 126, 237 hoje)
      passa a incluir `{ whatsappMessageId: message.id, repliedToWamid: message.repliedToWamid }`.
- [ ] Toda chamada existente a `this.messenger.sendText(...)`/`sendMenu(...)`
      continua igual (bot nunca cita, decisão 4) — só precisa continuar
      compilando com a nova assinatura opcional.

### Tarefa 6 — API: expor citação na leitura, aceitar citação no envio

**Arquivo:** `src/conversations/conversations.service.ts`

- [ ] `MESSAGE_INCLUDE` (linha 16) ganha
      `repliedTo: { select: { id: true, kind: true, body: true, direction: true } }`
      — preview leve o bastante pra renderizar a citação sem outro round-trip.
- [ ] `reply(id, text, replyToMessageId?: string)` repassa o parâmetro pro
      `messenger.sendText`.

**Arquivo:** `src/conversations/dto/reply.dto.ts`

- [ ] `ReplyDto` ganha `replyToMessageId?: string` (`@IsOptional() @IsString()`).

**Arquivo:** `src/conversations/conversations.controller.ts`

- [ ] `reply()` repassa `dto.replyToMessageId`.

Resposta da API por mensagem passa a incluir `whatsappMessageId`,
`repliedToWamid` e, quando resolvido, o objeto `repliedTo` (senão `null`).

### Tarefa 7 — Admin: exibir a citação

**Projeto:** `daverdinha` (frontend)

**Arquivo:** `src/features/admin/types/admin.ts`

- [ ] `Message` (linha 75) ganha `whatsappMessageId?: string | null`,
      `repliedToWamid?: string | null`, `repliedTo?: Pick<Message, 'id' | 'kind' | 'body' | 'direction'> | null`.

**Arquivo:** `src/app/admin/conversas/[id]/page.tsx`

- [ ] No loop de renderização de bolhas (~linha 280-315): quando
      `message.repliedTo` existir, mostrar um bloco compacto acima do corpo
      com o trecho da mensagem original (truncado, mesmo estilo visual do
      preview de push — reaproveitar `truncateBody`-equivalente se já
      existir no frontend, senão um `slice` simples).
- [ ] Quando `message.repliedToWamid` existir mas `message.repliedTo` for
      `null`: mostrar a faixa genérica "respondendo a uma mensagem anterior"
      (decisão 2), sem tentar renderizar conteúdo que não temos.

### Tarefa 8 — Admin: responder citando

**Projeto:** `daverdinha` (frontend), mesmo arquivo da Tarefa 7

- [ ] Ícone "responder" revelado no hover de cada bolha que tenha
      `message.whatsappMessageId` (mensagens sem isso não oferecem a ação —
      decisão 5). Em toque (mobile), aparece sempre visível em vez de depender
      de hover.
- [ ] Novo estado `replyingTo: { id: string; preview: string } | null`
      (ao lado do `replyText` já existente, linha 47). Clicar no ícone seta
      esse estado; um X ao lado do campo de resposta limpa ele.
- [ ] Faixa "respondendo a: <preview>" acima do textarea quando
      `replyingTo` não for `null`, mesmo padrão visual do WhatsApp Web.
- [ ] O `POST /conversations/:id/reply` (linha 107) passa a mandar
      `replyToMessageId: replyingTo?.id` no corpo, e `replyingTo` é limpo
      junto com `replyText` depois do envio.

---

## Como testar

- **Webhook** (Tarefa 2): `parseIncomingMessage` com um payload contendo
  `context.id`, mockado como os outros testes de `context` já existentes
  (`referred_product`).
- **Cliente WhatsApp** (Tarefa 3): mock de `fetch` retornando
  `{ messages: [{ id: 'wamid.X' }] }`, confirma que `sendText` devolve esse
  id e que o payload enviado inclui `context.message_id` quando passado.
- **Messenger** (Tarefa 4): `conversation-messenger.service.spec.ts` ganha
  casos para citação resolvida, citação não resolvida (`repliedToId` nulo) e
  `replyToMessageId` sem `whatsappMessageId` salvo na mensagem alvo (deve
  falhar de forma clara, não silenciosa).
- **Bot engine** (Tarefa 5): casos novos ao lado dos existentes, confirmando
  que `message.id`/`message.repliedToWamid` chegam no `recordInbound`.
- **API** (Tarefa 6): `conversations.service.spec.ts`/`conversations.controller.spec.ts`
  para o novo campo do DTO e o include.
- **Admin** (Tarefas 7/8): estado de citação resolvida, citação genérica, e
  fluxo de selecionar/cancelar/enviar uma resposta citando.

## Ordem sugerida

1. **Tarefas 1, 2, 3** — schema, extração do webhook, captura de wamid no
   envio. Nada muda de comportamento ainda, só passa a guardar o necessário.
2. **Tarefas 4, 5** — gravação e resolução da citação nos dois sentidos.
3. **Tarefa 6** — API expõe o que já está sendo gravado.
4. **Tarefas 7, 8** — admin exibe e permite citar.

## O que este plano deliberadamente não faz

- **Não faz backfill de mensagens antigas** (decisão 1).
- **Não muda o comportamento do bot** (decisão 3): citação é só metadado.
- **Não permite o bot citar** (decisão 4).
- **Não cobre imagem ainda** — o mecanismo (`context.message_id` no
  `WhatsAppClientService`) é genérico o bastante pra Tarefa 12/13 do plano
  de imagens reaproveitar quando `sendImage` existir, mas isso é trabalho
  daquele plano, não deste.
