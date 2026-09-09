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
A migration `20260907220331_init` (que simplifica o modelo de menu item e reduz os campos de `BotSettings`) DEVE ser aplicada ao banco de produção **ANTES** de fazer push desta branch para `main`. Como o Vercel faz auto-deploy em todo push para `main`, se o código for deployado antes da migration ser aplicada, **todas as mensagens de WhatsApp recebidas vão falhar** com erro "column does not exist" (o código tenta acessar colunas que não existem mais), levando o bot a ficar totalmente indisponível. Aplique a migration ao banco de Neon em produção primeiro, depois faça push para `main`.

Migração futura pra Railway (fase de produção): ver `SPEC.md` → "Stack (decidida)".

## Testes

- `npm test` — unitários
- `npm run test:e2e` — end-to-end (precisa de banco de dev rodando)

## Estrutura

- `src/` — módulos NestJS (`bot-settings`, `menu-items`, `delivery-locations`, `whatsapp`, `bot-engine`, `prisma`, `common/auth`).
- `api/index.ts` — entry point serverless usado pelo deploy na Vercel (envolve o `AppModule` num handler Express com instância cacheada entre invocações).
- `src/main.ts` — entry point usado localmente via `npm run start:dev`.

## Menu Items e Configurações

### Menu Items

O admin cria menu items de forma simplificada: cada item é apenas um **tema (topic) + resposta (reply)**. Internamente, todos os menu items criados pelo admin são do tipo `texto` — não há um seletor de tipo na UI admin.

Existe um menu item especial **do sistema** ("Locais de entrega", `isSystem: true`, tipo `entrega`), que é:
- Não-deletável
- Não-retipável (tipo permanentemente `entrega`)
- Pré-criado no seed (não aparece no fluxo de criação admin)
- Responsável por todo o fluxo de verificação de entrega, com suas próprias 5 mensagens (`deliveryPrompt`, `deliveryRetryMessage`, `deliveryConfirmedMessage`, `deliveryNotCoveredMessage`, `deliveryUnrecognizedMessage`)

Os tipos de menu item `atendente` e `pergunta` ainda existem e funcionam na engine do bot — permanecem no código e na API. Porém, atualmente não são acessíveis pela UI admin e, portanto, estão **dormentes**. Sua arquitetura foi preservada para uso futuro.

Toda interação com um menu item termina com um handoff para um atendente humano (`paused_human`) — o bot nunca entra em loop por conta própria.

### Campos de Configuração (BotSettings)

Os seguintes campos de `BotSettings` são editáveis via API pelo administrador:

- `botEnabled` — Booleano que ativa/desativa o bot
- `welcomeMessage` — Mensagem de boas-vindas exibida ao iniciar o bot
- `invalidAttemptsExceededMessage` — Mensagem exibida quando o usuário excede o número de tentativas inválidas

O prompt do menu ("Como posso te ajudar hoje?") é uma constante hardcoded em `bot-engine.service.ts` e **não é editável via API**.

As 5 mensagens do fluxo de entrega (`deliveryPrompt`, `deliveryRetryMessage`, `deliveryConfirmedMessage`, `deliveryNotCoveredMessage`, `deliveryUnrecognizedMessage`) agora residem no menu item do sistema "Locais de entrega" e são editáveis apenas junto com esse item.

## Locais de Entrega e Verificação por CEP (módulo `delivery-locations`)

`DeliveryLocation` deixou de ser uma lista editável pelo admin e passou a ser uma lista fixa e oficial de bairros do Rio, agrupados por região administrativa (`zone`) — populada pelo seed a partir dos arquivos de dados descritos abaixo. A API só permite:

- `GET /delivery-locations` — lista todos os bairros oficiais, cada um com suas faixas de CEP (`cepRanges`), ordenados por `zone` e depois por `regionName`.
- `PATCH /delivery-locations/:id` — alterna o campo `covered` (se aquele bairro é ou não atendido). Não existe mais criação nem remoção de `DeliveryLocation` pela API — a lista só muda via seed/migração.

### Fluxo de verificação de entrega no bot

O bot não pergunta mais o nome do bairro: agora ele pede o **CEP** do cliente (`deliveryPrompt`) e resolve a cobertura em duas etapas:

1. **Local** — o CEP é comparado contra as faixas seedadas na tabela `CepRange` de cada `DeliveryLocation`. Se cair dentro de alguma faixa, a cobertura (`covered`) já é decidida ali, sem chamada externa.
2. **Fallback via API** — se o CEP não cair em nenhuma faixa seedada, o `CepLookupService` consulta a BrasilAPI (`GET /api/cep/v2/{cep}`) pra obter o bairro correspondente, que então é comparado (normalizado) contra os `regionName` cadastrados.

Um CEP é considerado **não resolvido** tanto quando o formato é inválido (diferente de 8 dígitos) quanto quando a consulta à BrasilAPI falha ou não retorna bairro. Nesse caso o bot responde com `deliveryRetryMessage` e dá mais uma chance ao cliente; se a segunda tentativa também não resolver, o bot desiste e passa a conversa pro atendimento humano (`deliveryUnrecognizedMessage`, status `paused_human`) — igual ao comportamento de excesso de tentativas inválidas do resto do bot.

### Pipeline de dados (CNEFE → faixas de CEP)

A cobertura por CEP depende de dois arquivos em `prisma/data/`, montados em duas etapas:

- `scripts/generate-cep-ranges.ts` — rodado manualmente contra um extrato real do CNEFE (Cadastro Nacional de Endereços para Fins Estatísticos, IBGE), calcula a faixa mín/máx de CEP observada por bairro e escreve o resultado em `prisma/data/cep-ranges.json`. Tem suíte de testes própria, executada via `npm run test:scripts` (separado do `npm test` porque roda fora do contexto do Nest).
- `prisma/data/rj-bairros.json` — lista de bairros + região administrativa usada pelo seed pra popular `DeliveryLocation`.

⚠️ **Os dois arquivos estão hoje com dados de amostra** (8 bairros reais do Rio, escolhidos pra exercitar a estrutura, não a cobertura real da cidade). Antes de rodar o seed em produção, alguém precisa substituir `prisma/data/rj-bairros.json` pela lista oficial completa (a base de bairros do Data.Rio) e gerar um `prisma/data/cep-ranges.json` de verdade, rodando `generate-cep-ranges.ts` contra um extrato real do CNEFE.

## Conversas (módulo `conversations`)

Dá ao admin visão e controle manual sobre as conversas do bot:

- `GET /conversations` — lista todas as conversas.
- `GET /conversations/:id` — detalhe de uma conversa com o histórico de mensagens.
- `PATCH /conversations/:id` — edita o nome do contato (sem pré-condição de status).
- `POST /conversations/:id/reply` — envia uma mensagem de texto ao cliente via WhatsApp. Só funciona em conversas com status `paused_human`; fora disso retorna `400`.
- `POST /conversations/:id/pause` — transfere a conversa do bot pro atendimento humano (`bot_active` → `paused_human`). Só funciona em conversas com status `bot_active`; fora disso retorna `400`.
- `POST /conversations/:id/reactivate` — devolve a conversa pro bot (`paused_human` → `bot_active`), resetando `invalidAttempts`, `awaitingDeliveryReply` e `awaitingMenuItemAnswerId`. Só funciona em conversas com status `paused_human`; fora disso retorna `400`.

Além da reativação manual, uma conversa `paused_human` parada há 30 dias ou mais (contados a partir da última atualização da conversa) é reativada automaticamente e silenciosamente assim que chega a próxima mensagem do cliente — sem enviar nenhum aviso ao cliente, seja na reativação manual ou na automática.

Esses endpoints existem porque o número de WhatsApp do projeto não pode adotar retroativamente o recurso de "coexistência" do app/Cloud API da Meta (ele exige partir de uma conta de app do WhatsApp Business ativa, que este número não tem mais) — então o admin precisa da própria forma de responder pelo WhatsApp e de mover uma conversa entre bot e atendimento humano.

Ver `docs/superpowers/plans/2026-08-31-da-verdinha-api-backend.md` e `SPEC.md` (raiz do monorepo) para o desenho completo.
