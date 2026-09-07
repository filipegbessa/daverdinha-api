# daverdinha-api

Backend do bot de atendimento da Daverdinha (NestJS + Prisma + Postgres).

## Setup local

1. `cp .env.example .env` e preencher as variáveis (banco, Clerk, WhatsApp Cloud API).
2. `npm install`
3. `npx prisma migrate dev`
4. `npx prisma db seed`
5. `npm run start:dev`

## Deploy (fase de validação — Vercel)

1. Conectar o repositório no [vercel.com](https://vercel.com).
2. Configurar as env vars do `.env.example` no dashboard do projeto (usar o `DATABASE_URL` do Neon).
3. O `vercel.json` já direciona todas as rotas pra `api/index.ts` — não precisa configurar build command especial.
4. Rodar `npx prisma migrate deploy` apontando pro banco do Neon antes do primeiro deploy.

**⚠️ CRÍTICO — Ordenação de Deploy:**
A migration `20260903160212_add_pergunta_type_and_message_fields` (que adiciona 4 novos campos editáveis para mensagens do bot) DEVE ser aplicada ao banco de produção **ANTES** de fazer push desta branch para `main`. Como o Vercel faz auto-deploy em todo push para `main`, se o código for deployado antes da migration ser aplicada, **todos os mensagens de WhatsApp recebidas vão falhar** com erro "column does not exist" (o código tenta selecionar colunas que não existem ainda), levando o bot a ficar totalmente indisponível. Aplique a migration ao banco de Neon em produção primeiro, depois faça push para `main`.

Migração futura pra Railway (fase de produção): ver `SPEC.md` → "Stack (decidida)".

## Testes

- `npm test` — unitários
- `npm run test:e2e` — end-to-end (precisa de banco de dev rodando)

## Estrutura

- `src/` — módulos NestJS (`bot-settings`, `menu-items`, `delivery-locations`, `whatsapp`, `bot-engine`, `prisma`, `common/auth`).
- `api/index.ts` — entry point serverless usado pelo deploy na Vercel (envolve o `AppModule` num handler Express com instância cacheada entre invocações).
- `src/main.ts` — entry point usado localmente via `npm run start:dev`.

## Tipos de Menu Item e Configurações

### Tipos de Menu Item

O bot oferece 4 tipos de menu item, cada um com um comportamento diferente:

1. **`texto`** — Resposta direta. O usuário seleciona uma opção e recebe uma resposta prévia antes de ser encaminhado para um atendente.

2. **`entrega`** — Subfluxo de entrega. Gerencia informações de entrega de pedidos com mensagens configuráveis para diferentes estados (aguardando resposta, região não coberta, região não reconhecida).

3. **`atendente`** — Handoff para atendente. O usuário pode ser encaminhado imediatamente para um atendente, ou receber uma resposta prévia antes do encaminhamento.

4. **`pergunta`** — Uma pergunta com opções de resposta configuráveis. As opções de resposta (palavras-chave e respostas) são definidas inteiramente pelo administrador via API, sem necessidade de mudanças no código.

Toda interação com um menu item termina com um handoff para um atendente humano (`paused_human`) — o bot nunca entra em loop por conta própria.

### Campos Editáveis de Configuração (BotSettings)

Os seguintes campos de `BotSettings` são editáveis via API pelo administrador:

- `welcomeMessage` — Mensagem de boas-vindas exibida ao iniciar o bot
- `menuPrompt` — Prompt de instrução para selecionar uma opção do menu
- `deliveryPrompt` — Prompt específico para o subfluxo de entrega
- `deliveryWaitMessage` — Mensagem exibida enquanto se aguarda atualização de entrega
- `deliveryNotCoveredMessage` — Mensagem exibida quando a localização não está coberta para entrega
- `deliveryUnrecognizedMessage` — Mensagem exibida quando a localização não é reconhecida
- `invalidAttemptsExceededMessage` — Mensagem exibida quando o usuário excede o número de tentativas inválidas

> Nota: o módulo `conversations` (histórico de conversas, uso administrativo) foi propositalmente adiado e ainda não existe neste código — não é necessário para o bot funcionar.

Ver `docs/superpowers/plans/2026-08-31-da-verdinha-api-backend.md` e `SPEC.md` (raiz do monorepo) para o desenho completo.
