# daverdinha-api

Backend do bot de atendimento da Daverdinha (NestJS + Prisma + Postgres).

## Setup local

1. `docker compose up -d` — sobe o Postgres de desenvolvimento. A `DATABASE_URL` correspondente é `postgresql://daverdinha:daverdinha@localhost:5432/daverdinha`. Os dados ficam num volume nomeado, então sobrevivem a um `docker compose down`.
2. `cp .env.example .env` e preencher as variáveis (banco, Clerk, WhatsApp Cloud API).
3. `npm install`
4. `npx prisma migrate dev`
5. `npx prisma db seed`
6. `npm run start:dev`

Os passos 4, 5 e 6 só funcionam com o banco no ar — daí o passo 1 vir primeiro. Em produção esse papel é do Neon; o `docker-compose.yml` existe só pra não precisar instalar Postgres na máquina.

## Deploy (Vercel)

1. Repositório conectado em [vercel.com](https://vercel.com).
2. Env vars do `.env.example` configuradas no dashboard do projeto (`DATABASE_URL` do Neon, mais `R2_*` e `CRON_SECRET` — ver "Imagens" abaixo).
3. `vercel.json` já direciona todas as rotas pra `api/index.ts` e agenda o cron de retenção de mídia — não precisa configurar build command especial.

### ⚠️ Migration única + banco de produção com dado real

O projeto squasha o histórico de migration num único `*_init` (hoje
`prisma/migrations/20260923181318_init`): a cada mudança de schema, a pasta
é apagada e regenerada do zero, em vez de acumular migrations incrementais.

**Isso deixou de ser inofensivo.** Há banco de produção no ar (Neon) com
dado real — conversas, mensagens, menu, entregas. Rodar `prisma migrate
reset` ou `prisma migrate deploy` direto contra ele, depois de regenerar a
migration localmente, **apaga tudo**: o nome/checksum da migration muda a
cada squash, o Prisma não reconhece o que já está aplicado e tenta recriar
o schema inteiro do zero.

O caminho seguro depois de mudar `schema.prisma`:

1. Gerar só a diferença, sem tocar em produção ainda:
   ```bash
   DATABASE_URL="<url de produção>" npx prisma migrate diff \
     --from-url "<url de produção>" \
     --to-schema-datamodel prisma/schema.prisma \
     --script > delta.sql
   ```
2. **Ler o `delta.sql` inteiro.** Só deve conter `ALTER TABLE ADD COLUMN`, `ALTER TYPE ADD VALUE` ou equivalente — qualquer `DROP`/`TRUNCATE` é motivo pra parar e reconsiderar a mudança de schema antes de aplicar.
3. Aplicar o delta revisado:
   ```bash
   DATABASE_URL="<url de produção>" npx prisma db execute --file delta.sql
   ```
4. Registrar a migration local como aplicada, pra o próximo deploy não tentar recriar as tabelas:
   ```bash
   DATABASE_URL="<url de produção>" npx prisma migrate resolve --applied <nome_da_pasta_da_migration>
   ```
5. Conferir com `prisma migrate status` — deve dizer "Database schema is up to date!".

Migração futura pra Railway (fase de produção): ver `SPEC.md` → "Stack (decidida)".

## Testes

- `npm test` — unitários
- `npm run test:e2e` — end-to-end (precisa do banco do passo 1 no ar)

## Estrutura

- `src/` — módulos NestJS (`bot-settings`, `menu-items`, `delivery-locations`, `whatsapp`, `bot-engine`, `messaging`, `conversations`, `categories`, `push-notifications`, `media`, `prisma`, `common/auth`).
- `src/media/` — `MediaStorageService` (R2), `MediaRetentionService` (faxina + conferência) e a rota de cron que os liga. Ver "Imagens" abaixo.
- `src/bootstrap.ts` — a configuração de app (body parser, CORS, `ValidationPipe`) compartilhada pelos dois entry points, pra que local e produção não divirjam.
- `src/messaging/` — `ConversationMessengerService`, o único lugar que manda mensagem pro WhatsApp e grava no histórico. Os dois andam sempre juntos; fazer isso à mão em cada branch era como o histórico ficava com buracos.
- `api/index.ts` — entry point serverless usado pelo deploy na Vercel (envolve o `AppModule` num handler Express com instância cacheada entre invocações).
- `src/main.ts` — entry point usado localmente via `npm run start:dev`.

## Menu Items e Configurações

### Menu Items

Cada menu item é apenas um **tema (topic) + resposta (reply)**. Não existe mais campo `type`: o que distingue um item é o booleano `isSystem`.

Existe exatamente **um item de sistema** ("Locais de entrega", `isSystem: true`), que é:
- Não-deletável
- Pré-criado no seed (não aparece no fluxo de criação admin)
- Responsável por todo o fluxo de verificação de entrega, com suas próprias 5 mensagens (`deliveryPrompt`, `deliveryRetryMessage`, `deliveryConfirmedMessage`, `deliveryNotCoveredMessage`, `deliveryUnrecognizedMessage`)

O enum `MenuItemType` (`texto`/`entrega`/`atendente`/`pergunta`) e o modelo `MenuItemAnswerOption` foram removidos. `atendente` e `pergunta` nunca chegaram a ser criáveis pela UI nem pelo seed, então nenhuma linha existiu com esses tipos; e `texto` vs `entrega` só repetia o que `isSystem` já dizia.

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

- `GET /delivery-locations` — **autenticado**. Lista todos os bairros oficiais, cada um com suas faixas de CEP (`cepRanges`), ordenados por `zone` e depois por `regionName`.
- `PATCH /delivery-locations/:id` — **autenticado**. Alterna o campo `covered` (se aquele bairro é ou não atendido). Não existe mais criação nem remoção de `DeliveryLocation` pela API — a lista só muda via seed/migração.
- `GET /delivery-locations/covered` — **público**. Só os bairros com `covered: true`, agrupados por zona: `[{ zone, bairros }]`. É o que o site institucional consome na seção "Onde entregamos".

O endpoint público vive num controller separado (`PublicDeliveryLocationsController`) de propósito: assim "essa rota não exige token" é um fato estrutural, não um decorator que alguém precisa reparar que está faltando.

⚠️ **O seed cria todo bairro com `covered: false`.** Num banco novo o bot responde "ainda não entregamos aí" para qualquer CEP, e o site não mostra a seção de entregas — até alguém ligar os bairros atendidos em `/admin/entregas`. É um passo operacional obrigatório depois do primeiro seed.

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

- `GET /conversations?q=&unread=&categoryId=&page=&perPage=` — página de conversas ordenada por `updatedAt desc`. Devolve `{ items, page, perPage, total, totalPages, unreadTotal }`.
  - Os filtros rodam **no banco**, não no navegador. Filtrar client-side só filtraria a página carregada, escondendo em silêncio o que está fora dela.
  - `unreadTotal` ignora os filtros de propósito — alimenta o badge do menu, que conta tudo que espera um humano. O front pede `?perPage=1` só pra ler esse número.
  - ⚠️ `updatedAt` é a chave de ordenação **e** muda a cada mensagem recebida. Uma conversa pode pular pra página 1 enquanto o operador lê a página 3, empurrando tudo depois dela — então da página 2 em diante uma linha pode repetir ou ser pulada entre polls. **A página 1 nunca sofre isso**, e é onde o operador trabalha. Trade aceito conscientemente em troca de ter número de página.
- `GET /conversations/:id` — a conversa + o **fim** do histórico (últimas 50 mensagens) e `hasMoreMessages`.
- `GET /conversations/:id/messages?since=` — só o que chegou depois daquele instante. É o que o poll de 5s usa: antes ele rebaixava a thread inteira a cada tique.
  - `since` é **inclusivo**. `created_at` tem resolução de milissegundo e o bot escreve duas mensagens dentro do mesmo (boas-vindas + menu), então um `>` estrito perderia a segunda. A mensagem da borda volta e o cliente descarta pelo `id`.
- `GET /conversations/:id/messages?before=&limit=` — a página imediatamente anterior, pro scroll pra cima.
- `GET /conversations/:id/messages/:messageId/media?download=` — URL pré-assinada (5 min) do R2 pra mídia daquela mensagem, em JSON (`{ url }`). `?download=1` força `Content-Disposition: attachment`. Ver "Imagens" abaixo.
- `PATCH /conversations/:id` — edita o nome do contato (sem pré-condição de status).
- `POST /conversations/:id/reply` — envia uma mensagem de texto ao cliente via WhatsApp. Só funciona em conversas com status `paused_human`; fora disso retorna `400`.
- `POST /conversations/:id/reply-image` — multipart (`file` + `caption`/`replyToMessageId` opcionais); mesma regra de status do reply de texto. Ver "Imagens" abaixo.
- `POST /conversations/:id/pause` — transfere a conversa do bot pro atendimento humano (`bot_active` → `paused_human`). Só funciona em conversas com status `bot_active`; fora disso retorna `400`.
- `POST /conversations/:id/reactivate` — devolve a conversa pro bot (`paused_human` → `bot_active`), resetando `invalidAttempts` e `awaitingDeliveryReply`. Só funciona em conversas com status `paused_human`; fora disso retorna `400`.

Além da reativação manual, uma conversa `paused_human` parada há 30 dias ou mais (contados a partir da última atualização da conversa) é reativada automaticamente e silenciosamente assim que chega a próxima mensagem do cliente — sem enviar nenhum aviso ao cliente, seja na reativação manual ou na automática.

Esses endpoints existem porque o número de WhatsApp do projeto não pode adotar retroativamente o recurso de "coexistência" do app/Cloud API da Meta (ele exige partir de uma conta de app do WhatsApp Business ativa, que este número não tem mais) — então o admin precisa da própria forma de responder pelo WhatsApp e de mover uma conversa entre bot e atendimento humano.

Ver `docs/superpowers/plans/2026-08-31-da-verdinha-api-backend.md` e `SPEC.md` (raiz do monorepo) para o desenho completo.

## Paginação

`src/common/pagination.ts` concentra o DTO (`page`/`perPage`, 20 por padrão, teto de 100), o `pageBounds()` que traduz página em `skip`/`take`, e o `paginated()` que monta o envelope. `totalPages` tem piso 1, pra uma tabela vazia ler "Página 1 de 1" em vez de "1 de 0".

As mensagens de uma conversa **não** usam isso: ali a paginação é por cursor (`?before=`), porque `created_at` é imutável e o acesso é sempre "a partir daqui pra trás".

## Índices e o campo `unread`

Nenhum caminho quente tinha índice — e o Postgres **não cria índice em foreign key** sozinho. Foram adicionados:

| Índice | Por quê |
|---|---|
| `conversations(updated_at DESC)` | é o `ORDER BY` da listagem do admin |
| `conversations(phone)` | o bot faz `findFirst` por telefone a **cada mensagem recebida** |
| `conversations(unread)` | a contagem do badge |
| `messages(conversation_id, created_at)` | toda leitura de thread é "essa conversa, em ordem de tempo" |

`Conversation.unread` deixou de ser derivado e virou coluna. Antes o valor era "a última mensagem é inbound", o que obrigava a listagem a carregar a última mensagem **de cada conversa** a cada poll — um lateral por linha contra uma tabela `messages` sem índice. O `include` existia só pra isso e sumiu.

A coluna é mantida pelo `ConversationMessengerService`, na mesma transação da mensagem que a descreve. Como ele é o único que grava mensagem, o flag não tem como divergir. A exceção é o pedido de catálogo, que grava mensagem e pedido juntos numa transação própria — lá o `unread` é escrito à mão, e tem teste pra isso.

Efeito colateral proposital: agora **toda** mensagem toca a conversa, então `updatedAt` passou a significar "última atividade" de verdade. Antes só as rotas que por acaso davam `update` na conversa é que a moviam pro topo da lista.

## Categorias (módulo `categories`)

Rótulos coloridos que o admin anexa a conversas, pra filtrar a lista depois.

- `GET /categories?page=&perPage=` — página de categorias com a contagem de conversas de cada uma, ordenada por nome. Devolve `{ items, page, perPage, total, totalPages }`. Diferente das conversas, o nome não muda sozinho, então as fronteiras de página ficam paradas.
- `POST /categories` / `PATCH /categories/:id` / `DELETE /categories/:id` — CRUD.
- `POST|DELETE /conversations/:id/categories/:categoryId` — anexa/desanexa (ambos `204`).

A cor é escolhida livremente pelo operador num color picker. A API não tem paleta fixa — valida só que o valor é um hexadecimal `#rrggbb`, porque é isso que vai parar num `background-color` no front. O front calcula o contraste do texto do chip (`readableTextColor`) em vez de assumir branco, que quebrava assim que alguém escolhia um tom claro.

## Notificações push (módulo `push-notifications`)

Dois serviços com responsabilidades separadas de propósito:

- `PushNotificationsService` — só transporte: configura VAPID e põe bytes no fio, removendo inscrições que o navegador já invalidou (404/410).
- `ConversationNotifierService` — decide *se* vale notificar (só conversas já em `paused_human`) e monta o texto que o operador lê na tela de bloqueio.

O `WebhookController` não consulta o banco: o `BotEngineService` devolve qual conversa foi tocada, e o controller só repassa esse id pro notifier. Uma falha ao notificar nunca derruba o webhook — a Meta reentrega tudo que não recebe `200`, e a reentrega replayaria a mensagem.

### A prévia é a última mensagem **recebida**, não a última linha da thread

O notifier recebe só o `conversationId` — ele não sabe qual mensagem disparou o push, então relê a conversa. Ler a linha mais nova de qualquer direção dava duas prévias erradas:

- **Texto do próprio bot.** Quando o fluxo responde antes do push sair, a linha mais nova é `outbound`. Num pedido de catálogo em conversa já `paused_human` o fluxo termina no prompt de CEP, então o operador recebia um push escrito "qual seu CEP?" — e o branch `kind === 'order'` (que existe pra mostrar "Novo pedido pelo catálogo") ficava morto.
- **Mensagem de dias atrás.** Se nada foi gravado na requisição, a linha mais nova é a anterior da thread. Era o caso de mídia em conversa `paused_human`, abaixo.

Por isso o filtro é `where: { direction: 'inbound' }`, com `id` desempatando `createdAt` — o bot escreve duas mensagens no mesmo milissegundo, a mesma razão que obriga o `since` do endpoint de mensagens a ser inclusivo.

⚠️ Resta uma brecha estreita: um payload sem `type` e sem texto retorna `handled` sem gravar nada, e aí a prévia volta a ser a última recebida, que pode ser antiga. Fechar isso de vez exige o `handleIncomingMessage` devolver *qual* mensagem gravou, em vez de o notifier reler e adivinhar.

### Conteúdo inválido é respondido no gatilho do bot, em qualquer status

Mídia que o bot não sabe processar (áudio, vídeo, figurinha, documento, tipo desconhecido) é gravada como `invalid_content` com o rótulo `[Conteúdo inválido]` e respondida com `mediaReceivedMessage` **independente do status da conversa** — mesmo com um humano atendendo. Mesmo princípio que o pedido de catálogo já seguia: a resposta é sobre a mensagem, não sobre quem está tocando a conversa.

A checagem fica **acima** do return de `paused_human` de propósito. Abaixo dele, mídia mandada pra conversa em atendimento humano caía fora sem ser gravada: o histórico do operador ficava com um buraco, e o push disparado em seguida mostrava a mensagem anterior da thread.

`botEnabled` continua sendo a chave geral: com ele desligado a mensagem ainda é **gravada** (perder a mensagem é o que deixa buraco no histórico), mas o bot não responde.

**Imagem não passa mais por aqui** — ver "Imagens" abaixo. Ela só cai neste caminho quando o download falha de forma definitiva (tipo não suportado, arquivo grande demais) ou quando um teto de armazenamento é atingido; nesses casos o tratamento é idêntico ao de qualquer outra mídia não suportada.

## Imagens (módulo `media`)

O cliente manda foto pelo WhatsApp, ela vira mensagem comum no histórico (com legenda, se houver), fica guardada no Cloudflare R2, e o operador pode visualizar, baixar, compartilhar e **responder com outra imagem** — tudo isso gastando egress zero (R2 não cobra pra servir o arquivo de volta).

### Recebimento (`BotEngineService.processImageMessage`)

1. Confere o teto global de armazenamento (`BotSettings.mediaBytesUsed`, 8 GB) e o teto por conversa (20 imagens/24h) **antes** de gastar a chamada à Meta. Acima de qualquer um dos dois, cai no mesmo caminho de `invalid_content` acima.
2. Baixa da Meta em duas etapas autenticadas (`WhatsAppClientService.downloadMedia`), com prazo próprio em cada uma — a Meta reentrega o que não recebe `200` dentro do `maxDuration` da Vercel.
3. Sobe pro R2 (`MediaStorageService.put`) e grava a mensagem (`kind: 'image'`, legenda em `body`, `mediaKey`/`mediaMimeType`/`mediaSizeBytes`) via `ConversationMessengerService.recordInbound` — o mesmo caminho de gravação de qualquer mensagem, sem atalho paralelo.
4. A legenda é conteúdo, nunca comando: ela não participa de nenhuma decisão do bot, nem durante a espera de um CEP (onde uma foto conta como tentativa não resolvida, igual a um CEP ilegível).

### Envio (`ConversationMessengerService.sendImage`, `POST /conversations/:id/reply-image`)

Sobe **sequencialmente**, não em paralelo: primeiro pra Meta (`uploadMedia` + `sendImage`, o passo mais provável de falhar — cota, janela de 24h fechada), só depois pro R2. Fazer na ordem inversa deixaria um arquivo órfão no bucket sempre que o envio falhasse depois do upload. Nada é gravado — nem no R2, nem no banco — antes do envio à Meta dar certo.

### Armazenamento e teto (`MediaStorageService`, `BotSettings.mediaBytesUsed`)

- `MediaStorageService` fala com o R2 via `@aws-sdk/client-s3` (protocolo S3, o que torna o egress grátis). Chave sem nada adivinhável: `conversations/{conversationId}/{uuid}.{ext}`. Bucket privado — o admin acessa via URL pré-assinada de 5 minutos (`GET /conversations/:id/messages/:messageId/media`, que devolve `{ url }` em JSON, não um redirect, porque uma tag `<img>` não manda header de `Authorization`).
- O uso total é somado **na mesma transação** que grava a mensagem (`ConversationMessengerService.persist`) — não há como esse número divergir do que foi realmente gravado. Teto de 8 GB (2 GB de folga dos 10 GB grátis do R2); acima dele, o sistema **para de salvar** em vez de apagar algo pra abrir espaço.
- Teto por conversa (20 imagens/24h, janela móvel) impede uma única conversa de consumir sozinha o teto global.

### Retenção (`MediaRetentionService`, `GET /cron/media-retention`)

Cron diário (`vercel.json`, `CronSecretGuard` protegendo a rota — a Vercel manda `Authorization: Bearer $CRON_SECRET`) que faz o que pode esperar um dia:

- **Faxina:** apaga do R2 o arquivo de toda imagem com mais de 3 anos. A mensagem permanece no histórico — só `mediaKey`/`mediaMimeType`/`mediaSizeBytes` viram `null`. Ordem por arquivo: R2 primeiro, banco depois (uma falha no meio deixa a próxima execução tentar de novo; apagar do R2 é idempotente).
- **Conferência:** recalcula `SUM(media_size_bytes)` real e corrige `mediaBytesUsed`, caso ele tenha saído do lugar.

Nenhuma exclusão acontece por capacidade — só por idade. Encher o acervo bloqueia recebimento de foto nova, nunca apaga histórico antes da hora.
