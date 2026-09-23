# Recebimento, exibição e compartilhamento de imagens — plano de implementação

> **Status:** em implementação. Escrito em 2026-09-22, decisões incorporadas no
> mesmo dia, **Tarefas 1 a 3 commitadas em 2026-09-23** (`f284fb7b`). Migration
> regenerada, **Tarefas 4, 5 e 10 implementadas em 2026-09-23**, com medição
> real do lado do R2 feita (ver Tarefa 4) — o handshake TLS que travava as
> chamadas nesta máquina era TLS 1.3 especificamente, contornado só para o
> teste, nunca no código. **O contador de armazenamento da Tarefa 11 (metade
> ao vivo) também entrou em 2026-09-23** — a imagem tem teto de 8 GB desde
> já. A imagem já vira mensagem comum de ponta a ponta no bot engine — falta
> exibi-la no admin (Tarefas 6/7).

**Objetivo:** receber a imagem que o cliente manda pelo WhatsApp como mais uma
mensagem da conversa, guardá-la de forma durável, exibi-la no histórico do
admin, permitir que o operador a compartilhe (baixar no aparelho ou mandar para
o Google Drive) e permitir que ele **envie** imagem ao cliente — gastando zero
ou perto disso.

**Hoje:** imagem cai no bucket de conteúdo inválido (`kind: invalid_content`,
corpo `[Conteúdo inválido]`) e o bot responde *"Esse tipo de mensagem não é
válido por aqui!"*. A imagem nunca é baixada.

## Pré-requisitos que travam o resto

Três coisas precisam existir antes da Tarefa 4, e nenhuma delas é código:

| # | O quê | Status |
|---|---|---|
| 1 | **Postgres de pé** para regenerar a migration única. | ✅ Resolvido em 2026-09-23 — migration `20260923164240_init` regenerada e aplicada, banco local com `image`, `media_key`, `media_mime_type`, `media_size_bytes`. |
| 2 | **SDK do R2 instalado.** Sem ele não há como assinar requisição (implementar SigV4 à mão seria pior em todos os aspectos). | ✅ Resolvido em 2026-09-23 — `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` instalados. |
| 3 | **Bucket e credenciais** criados no console da Cloudflare — é a Tarefa 10. | ✅ Resolvido em 2026-09-23 — bucket privado `daverdinha-media`, token escopado, variáveis no `.env`/`.env.example`/Vercel. |

A medição que decide o desenho da Tarefa 4 (download + upload cabem dentro do
webhook?) depende das três, e as três agora existem. O que falta não é mais
pré-requisito — é conseguir falar com o R2 a partir de algum lugar que não
bloqueie `*.r2.cloudflarestorage.com` na camada de TLS (ver a nota no fim da
Tarefa 10).

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Storage: Cloudflare R2.** |
| 2 | **Imagem passa a ser tratada como um texto do cliente.** Quando isto estiver no ar, imagem deixa de disparar o gatilho de conteúdo inválido — sem `[Conteúdo inválido]` e sem a resposta automática. |
| 3 | **Só imagem agora.** Áudio fica para depois, num plano próprio, escrito a partir do que funcionar aqui. |
| 4 | **Uma única regra de exclusão: idade, 3 anos.** Valendo também para áudio. Encher o acervo **nunca apaga nada** — ao cruzar o teto o sistema para de salvar imagem e volta ao comportamento de conteúdo inválido, avisando no admin. Ninguém consegue forçar exclusão antecipada, nem enchendo o bucket de propósito. Ver Tarefa 11. |
| 5 | **Compartilhamento é requisito**, não extra: baixar no computador/celular e enviar ao Google Drive. |
| 6 | **A legenda da imagem é conteúdo, nunca comando.** Ela aparece no sistema, mas não dirige o bot em nenhum ponto do fluxo: resposta de CEP tem que ser texto, e foto legendada com "menu" não reinicia a conversa. Imagem durante a espera do CEP — com legenda ou sem — é aceita e guardada, e o bot responde que não entendeu o CEP, como já faz hoje. |
| 7 | **Enviar imagem ao cliente entra neste plano** (Tarefas 12 e 13), não fica para depois. |

---

## O que decide o desenho: três prazos da Meta

Não são negociáveis e definem quase tudo abaixo:

| Prazo | Valor | Consequência |
|---|---|---|
| URL de download | **5 minutos** | Não dá para baixar depois com calma. Tem que ser na hora. |
| Media ID vindo de webhook | **7 dias** | Mata a ideia mais barata de todas (ver "Opção descartada"). |
| Arquivo nos servidores da Meta | 30 dias | Irrelevante: o id do webhook morre antes. |

O download é em duas etapas, ambas autenticadas com o
`WHATSAPP_CLOUD_API_TOKEN`: `GET /v20.0/{media-id}` devolve um JSON com a `url`,
e só então se baixa a `url` mandando o `Bearer` de novo (ela não é pública).

**Opção descartada:** guardar só o `media_id` e buscar sob demanda custaria R$ 0
e é inviável — o id expira em 7 dias e a imagem sumiria sozinha.

---

## Storage: R2 (decidido)

10 GB grátis e **egress zero**. Egress grátis é o que decide: exibir imagem é
ler muitas vezes. R2 fala o protocolo do S3, então dá para usar
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

As alternativas ficam registradas só como justificativa: Vercel Blob (1 GB,
e o tráfego divide a cota Hobby das páginas), Supabase (1 GB, e **o projeto
free pausa após 7 dias sem uso** — inaceitável para armazenamento), Cloudinary
(25 créditos/mês, mas cada transformação consome crédito).

### A conta da retenção de 3 anos precisa de atenção

Premissa: a foto já chega comprimida pelo WhatsApp, tipicamente 100–400 KB. A
30 fotos/dia a ~300 KB:

| Período | Acumulado |
|---|---|
| 1 mês | ~270 MB |
| 1 ano | ~3,3 GB |
| **3 anos** | **~9,9 GB** |

⚠️ Com retenção de 3 anos, o acervo chega a **~9,9 GB bem na hora em que a
primeira purga começa** — ou seja, encosta no teto gratuito. Note que a conta
inteira depende da premissa de 30 fotos/dia: **ela é um chute, e é o número
mais frágil deste plano**. Medir o volume real nas primeiras semanas vale mais
do que refinar qualquer outra estimativa daqui.

É por isso que a Tarefa 11 não confia só na regra de idade: se a premissa
estiver errada para mais, o teto de 8 GB chega antes dos 3 anos e o sistema para
de salvar. Nesse cenário a resposta certa não é apagar mais rápido — é olhar o
número real e decidir entre pagar os centavos ou encurtar a retenção.

E **somar áudio a este mesmo bucket estoura o teto**, porque áudio pesa muito
mais por mensagem. O plano de áudio vai ter que refazer esta conta, não
herdá-la.

### Privacidade não é detalhe

Clientes mandam **comprovante de pagamento**. Bucket público com URL
adivinhável vaza comprovante. Portanto: bucket **privado**, e a imagem chega ao
admin por **URL pré-assinada de vida curta**, gerada sob demanda por rota com
`ClerkAuthGuard`. Pré-assinada em vez de proxy pela API porque o egress do R2 é
grátis e o da Vercel não.

---

## Restrições do projeto

- **Vercel serverless**: sem disco persistente e sem processo em background —
  o que não acontecer dentro da requisição não acontece.
- **O webhook tem que responder rápido.** A Meta reentrega tudo que não receber
  `200`. Este é o risco central (ver Tarefa 4).
- **Migration única**: o projeto squasha o histórico num único `_init`. Ao mexer
  no `schema.prisma`, apague a pasta existente e regenere uma só.
- Testes ficam ao lado do arquivo testado, dentro de `src/` (`rootDir: 'src'`).

### O que mudou no projeto depois que este plano foi escrito

O plano `2026-09-22-reply-to-message.md` já está no `main`, e ele move o chão
debaixo de algumas destas tarefas:

- `Message` ganhou `whatsappMessageId`, `repliedToWamid` e `repliedToId`.
- `ConversationMessengerService.recordInbound` agora é
  `(conversationId, body, kind, options?: { whatsappMessageId?, repliedToWamid? })`
  — a Tarefa 5 escreve por aí, e as colunas de mídia entram nesse mesmo
  `options`, não num caminho paralelo.
- `persist()` continua sendo o **único** lugar que grava mensagem, e já roda em
  transação. É lá que o contador da Tarefa 11 tem que somar: mesmo write,
  mesma transação, sem chance de divergir.
- `sendText` aceita `options?: { replyToMessageId? }`, que é o que a Tarefa 12
  espelha em `sendImage`.

---

## Tarefas

### Tarefa 1 — Schema ✅

- [x] `image` no enum `MessageKind`.
- [x] Colunas anuláveis em `Message`: `mediaKey`, `mediaMimeType`,
      `mediaSizeBytes`. Client do Prisma gerado.
- [x] **Migration única regenerada** em 2026-09-23
      (`20260923164240_init`) — banco local resetado e recriado com as
      colunas, seed rodando limpo.

Sem coluna própria para legenda: `image.caption` do webhook chega e é
gravado em `body`, o mesmo campo que qualquer mensagem de texto já usa — é
o que a Tarefa 5 grava e a Tarefa 7 lê, sem campo novo na interface `Message`
do frontend.

Colunas em `Message` em vez de tabela nova: é sempre 1:1 com a mensagem, e a
leitura da thread não ganha um `join`.

### Tarefa 2 — Parser do webhook ✅

- [x] `parseIncomingMessage` extrai `image?: { id, mime_type, sha256, caption }`.
- [x] `IncomingMessage.type` virou opcional no caminho: o webhook não garante o
      campo, e os dois lugares que o leem (`=== 'order'` e
      `isUnsupportedContent`) já tratavam a ausência.
- [x] O envelope da Meta passou a ser tipado em vez de `any`, o que zerou os 19
      problemas de lint que o arquivo carregava.
- [x] A legenda vem em `image.caption`, **não** em `text.body`. Ela é guardada e
      exibida (decisão 6), mas **não** entra no cálculo de `text` em
      `bot-engine.service.ts:111` — é esse detalhe que mantém a legenda fora das
      decisões do bot. Manter os dois campos separados é o que implementa a
      regra "conteúdo, não comando"; bastaria juntá-los para quebrá-la sem
      querer.

### Tarefa 3 — Cliente de mídia ✅

- [x] `WhatsAppClientService.downloadMedia(mediaId)`, nas duas etapas
      autenticadas.
- [x] Prazo nas duas chamadas: **4s** nos metadados, **10s** no download. Somam
      14s, dentro do `maxDuration` de 30s e com folga para o resto do webhook.
- [x] Tipo e tamanho conferidos **nos metadados, antes de baixar os bytes** —
      não há por que trazer 5 MB para descartar em seguida.
- [x] ⚠️ **Corrigido em 2026-09-23:** o teto era conferido *só* contra o
      `file_size` declarado. Esse campo pode vir ausente, e aí `0 > MAX` é
      falso — o download acontecia **sem limite nenhum**, carregando a resposta
      inteira em memória dentro do webhook. Agora são três guardas:
      `file_size` dos metadados, `content-length` da resposta (que evita
      bufferizar) e `buffer.byteLength` depois (porque `content-length` some em
      resposta com chunked encoding).

#### O contrato que a Tarefa 5 tem que honrar

Não estava no plano original e é o ponto mais importante desta tarefa. O retorno
é uma união discriminada, porque os dois tipos de falha pedem reações opostas:

| Falha | Retorno | Por quê |
|---|---|---|
| Tipo não suportado, arquivo grande demais | `{ ok: false, reason }` | Definitivo. Tentar de novo dá o mesmo — o chamador grava conteúdo inválido. |
| Rede, 5xx, prazo estourado | **estoura** | O erro sobe ao webhook, devolve a reivindicação do wamid, e a reentrega da Meta vira outra chance. |

Engolir a falha transitória num `ok: false` perderia a foto do cliente por um
soluço de rede. É o contrário do que parece defensivo.

### Tarefa 4 — Armazenamento (⚠️ a decisão de risco)

- [x] `MediaStorageService` (`src/media/media-storage.service.ts`) com
      interface enxuta (`put(key, buffer, mimeType)` +
      `signedUrl(key, { download? })`), para trocar de provedor sem mexer no
      resto. Fala com o R2 via `@aws-sdk/client-s3` (protocolo S3) e assina
      URL com `@aws-sdk/s3-request-presigner`, TTL de 5 minutos. Testado com
      o `S3Client` e o `getSignedUrl` mockados — nunca fala com R2 de verdade
      (`media-storage.service.spec.ts`).
- [x] Chave sem nada adivinhável: `buildMediaKey(conversationId, mimeType)`
      gera `conversations/{conversationId}/{uuid}.{ext}`, com a extensão
      derivada do mime (`jpg`/`png`/`webp`, e `bin` como fallback).
- [x] Variáveis de ambiente novas em `.env.example`: `R2_ACCOUNT_ID`,
      `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (mecânica da
      Tarefa 10, adiantada aqui porque o serviço já lê essas variáveis).
- [x] `MediaStorageModule` ligado — a Tarefa 5 importou-o em
      `BotEngineModule`, que já está em `AppModule`, e `processImageMessage`
      é o primeiro consumidor real.
- [x] **Medição do lado do R2 feita em 2026-09-23.** A causa do handshake TLS
      era TLS 1.3 especificamente — forçando TLS 1.2 nesta máquina (só para o
      teste, nunca no código real) a conexão funcionou de primeira e devolveu
      erro S3 normal (`InvalidArgument: Authorization`, esperado sem
      assinatura). Cheira a alguma inspeção de tráfego local que não lida bem
      com o `ClientHello` maior do TLS 1.3 com troca de chave pós-quântica que
      a Cloudflare usa — **não é bloqueio de conta, bucket ou rede em geral**
      (o Chrome, que usa outra pilha TLS, sempre alcançou o domínio sem
      ajuste nenhum). Como a Vercel roda em rede própria, bem diferente desta,
      não há motivo para supor que o mesmo problema apareça em produção — e
      o código de produção não teve nenhum downgrade de TLS aplicado.
      Números reais (upload de 400 KB, 3 execuções, conexão fria a cada vez):
      `put` 0,8–1,9 s, `signedUrl` 3 ms (não sai da máquina), download de
      volta 0,6 s. Dentro da estimativa original.
- [ ] ⚠️ **Falta medir o lado da Meta** (download do `media_id`). Não dá para
      testar sem uma foto real chegando pelo WhatsApp — o `media_id` expira e
      não existe um de teste disponível agora. Combinado com o número do R2
      acima, o total (baixar da Meta + subir no R2) segue dentro da
      estimativa original de 300 ms – 1,5 s, mas vale confirmar com uma foto
      de verdade assim que o fluxo estiver em produção.

**O que mudou a favor da abordagem síncrona:** o commit `b294075d` passou a
devolver a reivindicação do `wamid` quando o processamento falha. Antes, uma
falha no meio do download deixava o wamid reivindicado e a reentrega da Meta
era descartada — a mensagem sumia. Agora a falha vira nova tentativa. Isso torna
"baixar dentro do webhook" bem mais defensável do que era.

Se a medição reprovar, as saídas são: (a) gravar a mensagem com o `media_id` e
baixar no primeiro acesso do admin — só funciona dentro da janela de 7 dias, ou
(b) uma fila (QStash/Upstash tem free tier).

### Tarefa 5 — Bot engine: imagem vira mensagem comum ✅

- [x] Tirar `image` de `isUnsupportedContent` (`bot-engine.service.ts`). Áudio,
      vídeo, figurinha e documento continuam como conteúdo inválido.
- [x] `MediaStorageModule` ligado em `BotEngineModule` — passa a ter
      consumidor, como a Tarefa 4 previa. `processImageMessage` baixa da
      Meta, sobe pro R2 com `buildMediaKey(conversationId, mimeType)` e só
      então grava.
- [x] Gravar via `recordInbound(conversationId, caption ?? null, 'image', {...})`
      — a legenda vai no `body`, e as colunas de mídia entram no mesmo `options`
      que já leva `whatsappMessageId` e `repliedToWamid`. Nada de caminho
      paralelo: `persist()` continua sendo o único lugar que grava mensagem.
      `recordInbound`/`persist()` em `ConversationMessengerService` ganharam
      `mediaKey`/`mediaMimeType`/`mediaSizeBytes` no mesmo `options`.
- [x] Tratar o retorno de `downloadMedia` conforme o contrato da Tarefa 3:
      `{ ok: false }` vira `invalid_content`; erro **não** é capturado aqui,
      sobe para o webhook devolver a reivindicação do wamid.

**Imagem durante a espera do CEP** (decisão 6). `isDeliveryReply` exige `!!text`
(`bot-engine.service.ts:117`), e a legenda não conta como texto — então a
imagem nunca vira resposta de CEP. Sem tratamento, ela escorreria até
`handleMenuSelection` e reexibiria o menu, cancelando o fluxo. O correto é
desviá-la para o caminho de "CEP não entendido", que já existe:

- [x] Com `awaitingDeliveryReply` ligado e chegando imagem: gravar a imagem
      (com a legenda) e então rodar `registerUnresolvedAttempt`.
- [x] ⚠️ **Não dá para chamar `DeliveryCheckService.handleReply`**: ele grava a
      mensagem por conta própria como texto (`delivery-check.service.ts:47`), e
      aqui a gravação é a da imagem. `registerUnresolvedAttempt` virou público
      em vez de uma entrada nova — já fazia exatamente "conta e responde, sem
      gravar nada", então só precisava deixar de ser `private`.

O efeito, sem inventar orçamento novo — é o mesmo de um CEP ilegível hoje, com
`MAX_DELIVERY_CEP_ATTEMPTS = 2`:

| Evento | Resposta do bot |
|---|---|
| 1ª imagem durante a espera | `deliveryRetryMessage` |
| 2ª imagem durante a espera | `deliveryUnrecognizedMessage` + handoff (`paused_human`) |

**Conversa em `bot_active`: nenhum caso especial.** Uma foto que não é resposta
de CEP segue o caminho do texto — gasta tentativa e reexibe o menu, escalando
para um humano na terceira. É o desfecho desejável: cliente que manda foto atrás
de foto quer falar com uma pessoa, e o operador recebe a conversa com as fotos
já no histórico.

### Tarefa 6 — API de leitura ✅

⚠️ **Corrigido em 2026-09-23: o desenho anterior (302) não funcionava.** O
plano dizia "rota com `ClerkAuthGuard` devolvendo redirect 302", com o `<img>`
da Tarefa 7 apontando para ela. Uma tag `<img src>` **não manda header
nenhum** — e o admin autentica com `Authorization: Bearer <token do Clerk>`
montado pelo `apiFetch` (`api-client.ts:12`), contra uma API em **outra
origem**. A requisição sairia sem Authorization e o guard responderia 401.

- [x] `GET /conversations/:id/messages/:messageId/media` com `ClerkAuthGuard`
      (herdado do controller), devolvendo **`{ url }` em JSON**.
- [x] `?download=1` — e só essa string — pede o anexo. A tradução fica no
      controller, para o service não conhecer query param.
- [x] A busca é **escopada à conversa da URL** (`findFirst` por
      `{ id, conversationId }`). Solta, saber um id de mensagem bastaria para
      ler mídia de qualquer conversa.
- [x] Mesmo 404 para "não é dessa conversa" e para "não tem arquivo" — que
      cobre mensagem de texto e imagem já expurgada pela retenção. Distinguir
      só contaria ao cliente o que existe.
- [x] A URL continua **fora do payload da thread**: expira em 5 min e a thread
      fica em cache no cliente.
- [ ] Tratar a expiração no admin: `onError` no `<img>` refaz a busca. Fica
      com a Tarefa 7.

### Tarefa 7 — Admin: exibir

- [ ] Renderizar `kind === 'image'` em `src/app/admin/conversas/[id]/page.tsx`
      (o `switch` de bolha por `kind` já existe), com `loading="lazy"` e clique
      para abrir em tamanho cheio.
- [ ] O `src` é a **URL assinada** que a Tarefa 6 devolve, buscada via
      `apiFetch`, e não a rota da API — ver o aviso lá.
- [ ] **Exibir a legenda junto da imagem** (decisão 6) — ela é conteúdo que o
      cliente escreveu e precisa aparecer, mesmo não valendo como comando.
- [ ] Adicionar `'image'` ao tipo `MessageKind` em `src/features/admin/types/admin.ts`.

### Tarefa 8 — Admin: compartilhar

O admin já é um **PWA instalado no celular** (`start_url: /admin`,
`display: standalone`), e é aí que o operador trabalha. Isso muda qual é a
solução certa.

- [ ] **Botão "compartilhar" usando a Web Share API.**
      `navigator.share({ files: [file] })` abre a folha de compartilhamento
      nativa do aparelho — que **já traz Google Drive, WhatsApp, Fotos, e-mail e
      o resto**. Cobre os dois pedidos (salvar no aparelho e mandar pro Drive)
      **sem nenhum OAuth, sem token, sem backend**. Fluxo: buscar a URL assinada
      → `fetch` → `blob` → `new File(...)` → `navigator.share`.
- [ ] ⚠️ **Depende de CORS no bucket** (Tarefa 10). O `fetch` da URL assinada
      é cross-origin contra o R2; sem CORS ele falha e só o botão "baixar"
      funciona. É o único item do plano que exige isso.
- [ ] Guardar atrás de `navigator.canShare({ files })`, porque o suporte a
      arquivos não é universal — Android Chrome e Safari do iOS sim, desktop
      varia, Firefox não.
- [ ] **Fallback: botão "baixar"**, um `<a download>` apontando para a rota da
      Tarefa 6 com `?download=1`. É o caminho no desktop e onde a Web Share não
      existir.

**Google Drive direto (OAuth no servidor) fica fora por enquanto.** Exigiria
tela de consentimento do Google, escopo `drive.file`, guardar e renovar refresh
token por usuário do Clerk — trabalho considerável para entregar, no celular, o
que a folha nativa já entrega de graça. Só vale se aparecer necessidade de
enviar ao Drive **pelo desktop** ou de forma automática, sem clique. Registrado
aqui como decisão consciente, para não parecer esquecimento.

### Tarefa 9 — Prévia da notificação push ✅

O `ConversationNotifierService` monta o corpo do push a partir da última
mensagem recebida. Com `kind: 'image'` isso fica errado dos dois lados: hoje o
operador receberia `[Conteúdo inválido]`, e depois da Tarefa 5 receberia
`Nova mensagem` sempre que a foto vier sem legenda — o mesmo lugar onde o
pedido de catálogo já vira "Novo pedido pelo catálogo".

- [x] Prévia `📷 Foto` para imagem sem legenda, e `📷 <legenda>` quando houver.
- [x] A prévia já passa por `truncateBody` (120 caracteres), então legenda longa
      não precisa de tratamento próprio.
- [x] A montagem saiu do ternário e virou `buildPreview()`, porque com três
      casos (pedido, imagem, texto) o encadeado já não dizia mais o que fazia.

### Tarefa 10 — Configuração do R2 ✅

Mecânico, mas é o que faz o resto rodar, e não estava escrito em lugar nenhum.
Feito em 2026-09-23, pelo painel da Cloudflare.

- [x] Bucket **privado** `daverdinha-media` criado (a Tarefa 4 depende
      disso). "By default buckets are not publicly accessible" — confirmado
      na própria tela de criação, nada a configurar além do padrão.
- [x] Token de API do R2 com escopo só nesse bucket (`daverdinha-media`),
      permissão Object Read & Write, não na conta inteira.
- [x] Variáveis novas — endpoint da conta (`R2_ACCOUNT_ID`), `R2_BUCKET`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — no `.env.example`, no
      `.env` local e no painel da Vercel (`target: production`, tipo
      `sensitive`, mesmo padrão dos demais segredos do projeto).
- [ ] ⚠️ **CORS: a conclusão anterior estava errada e precisa ser refeita.**
      Estava marcado como resolvido ("nada a configurar, o navegador nunca fala
      com o R2 direto"), premissa que caiu junto com o redirect 302 da Tarefa 6.
      O navegador **vai** falar com o R2 direto. Nem todo uso exige CORS:

      | Uso | Precisa de CORS? |
      |---|---|
      | `<img src>` apontando pro R2 (Tarefa 7) | Não |
      | `<a download>` com `response-content-disposition` (Tarefa 8) | Não |
      | `fetch` → `blob` → `navigator.share` (Tarefa 8) | **Sim** |

      Só o compartilhamento nativo precisa. Configurar CORS no bucket
      **restrito à origem do admin**, não aberto — e só quando a Tarefa 8
      chegar, para não liberar antes de ser necessário.
- [x] `CRON_SECRET` gerado e adicionado ao `.env.example`, `.env` local e
      Vercel — protege a rota de purga da Tarefa 11.

✅ **Causa da falha de TLS encontrada e contornada para medição em
2026-09-23.** Era TLS 1.3 especificamente: forçando TLS 1.2 nesta máquina
(via `https.Agent({ maxVersion: 'TLSv1.2' })`, só no script de teste, nunca
no código real) a conexão funcionou de primeira, devolvendo o erro S3
esperado para uma chamada sem assinatura. O Chrome já alcançava o domínio
sem ajuste nenhum (outra pilha TLS), o que aponta para alguma inspeção de
rede local que não lida bem com o `ClientHello` maior do TLS 1.3 com troca
de chave pós-quântica — não uma configuração errada no bucket/token, nem um
bloqueio de domínio específico. Números reais da medição estão na Tarefa 4.
Como a Vercel roda em rede própria, não há motivo para esperar o mesmo
problema em produção, e nada no código de produção foi alterado por causa
disso.

### Tarefa 11 — Limite de armazenamento e faxina

**Uma regra só apaga: idade.** Passou de 3 anos, sai. Encher o acervo não apaga
nada — quando o uso cruza o teto, o sistema **para de salvar** e volta ao
comportamento de conteúdo inválido de hoje.

Essa escolha custa uma coisa e compra outra: você deixa de receber foto nova
enquanto ainda segura histórico de dois anos atrás. Em troca, **não existe
nenhum caminho pelo qual um dado seja apagado antes da hora** — nem por
enxurrada, nem por bug de ordenação, nem por engano de operação. E a regra de
exclusão vira uma frase que cabe na cabeça de qualquer um.

Como nada é apagado por capacidade, o **piso de 12 meses deixou de existir**:
ele só fazia sentido para conter uma purga por capacidade que agora não há.

**Antes dos números: 10 GB não é um precipício.** O R2 cobra por GB-mês e o free
tier são 10 GB-mês; passar disso não interrompe nada, só custa
US$ 0,015/GB-mês. O teto abaixo existe para manter o custo perto de zero, não
para evitar desastre — e é por isso que "parar de salvar" é resposta aceitável.

#### O contador é ao vivo, não do cron ✅

O uso é somado **na mesma transação que grava a mensagem**, dentro do
`ConversationMessengerService` — que já é o único lugar autorizado a gravar
mensagem, então é onde o número não tem como divergir. Implementado em
2026-09-23.

- [x] Guardado como **bytes em uso** (`BotSettings.mediaBytesUsed`), não um
      booleano "cheio" — é uma comparação contra o teto, e o número já sai
      exposto em `GET /bot-settings` para quando o admin quiser mostrá-lo
      ("7,2 GB de 8 GB"), embora a UI graduada em si (ver "degradar em
      silêncio" abaixo) ainda não exista.
- [x] ⚠️ **`BigInt`**, confirmado na migration (`media_bytes_used BIGINT`).
- [x] Somado dentro de `persist()` (`conversation-messenger.service.ts`) via
      `mediaBytesUsed: { increment: message.mediaSizeBytes } }`, só quando a
      mensagem carrega `mediaSizeBytes` — texto e outbound não tocam o
      contador.
- [x] Teto de **8 GB** (`MEDIA_STORAGE_CAP_BYTES` em `bot-engine.service.ts`),
      2 GB de folga dos 10 GB gratuitos.
- [x] `processImageMessage` (Tarefa 5) lê `botSettings.get().mediaBytesUsed`
      **antes** de chamar `downloadMedia`. Acima do teto: nem baixa, nem
      sobe — cai no mesmo caminho de conteúdo inválido que uma imagem sem
      suporte já usa.

⚠️ **Por que ao vivo e não no cron:** o cron do plano Hobby roda no máximo uma
vez por dia. Se fosse ele a descobrir que encheu, bastaria despejar imagens logo
depois de uma execução para o sistema seguir salvando por 24h sem barrar nada —
e a Meta aceita imagem de até 5 MB. Com o contador em transação, o bloqueio é
imediato e essa janela não existe.

✅ **Confirmado: o caminho de conteúdo inválido para imagem não virou código
morto.** `handleUnsupportedMessage` é reaproveitado tanto para download que
falha quanto para o teto estourado — a Tarefa 5 não removeu essa capacidade,
só parou de usá-la para todo `type: 'image'`.

⚠️ **Ainda em aberto: degradar em silêncio.** O número está exposto via API,
mas não existe aviso graduado no admin (o padrão do "bot desativado por falta
de item de menu" mencionado aqui) — isso é trabalho de frontend, fora do que
foi tocado nesta sessão (só `daverdinha-api`). Sem esse aviso, o operador só
percebe o teto quando as fotos começarem a parar de chegar.

#### Teto por conversa

**Recomendação minha, não decisão sua — corte se achar demais.** O contador
protege o total, mas não impede que **uma única conversa** consuma os 8 GB e
desligue o recurso para todos os outros clientes.

- [ ] Teto de imagens aceitas por conversa por dia; acima dele, caminho de
      conteúdo inválido. É um `count` barato sobre `messages`, e corta o vetor
      na origem em vez de depender do teto global.

#### O cron: faxina e conferência

Na Vercel, cron **não é processo em segundo plano** — é a Vercel chamando uma
URL da própria API no horário marcado. Como é só uma URL, qualquer um pode
chamá-la, e esta apaga arquivos.

No plano Hobby roda **no máximo uma vez por dia**, com horário garantido só
dentro da hora. Isso deixou de ser limitação: o que era urgente (bloquear ao
encher) virou instantâneo com o contador, e sobrou para o cron só o que pode
esperar.

- [ ] **Faxina:** apagar o que passou de 3 anos. Um dia a mais num arquivo de
      três anos não muda nada.
- [ ] **Conferência:** recalcular o `SUM(media_size_bytes)` real e corrigir o
      contador, que pode sair do lugar por exclusão manual ou gravação
      interrompida.
- [ ] ⚠️ **Proteger a rota.** A Vercel envia `Authorization: Bearer $CRON_SECRET`
      quando a variável existe. Verificar é obrigatório: sem isso, a rota que
      apaga imagens fica aberta.
- [ ] **Lotear a exclusão.** O `maxDuration` do `vercel.json` é 30s e vale aqui
      também. Apagar por lote com orçamento de tempo, deixando o resto para a
      execução seguinte.
- [ ] Escolher horário de baixo movimento (madrugada), lembrando que o Hobby
      garante a hora, não o minuto.

**Ordem dentro do job: apagar → reconciliar → gravar o contador.** Reconciliar
antes de apagar grava um número que a própria execução vai invalidar.

**Ordem da exclusão de cada arquivo: R2 primeiro, `mediaKey` depois.** Se o R2
falhar, a linha ainda aponta e a próxima execução tenta de novo; se o banco
falhar depois de um R2 bem-sucedido, o delete se repete e é idempotente. A ordem
inversa deixaria `mediaKey` apontando para arquivo inexistente.

- [ ] A mensagem **permanece** no histórico, marcada como imagem expirada — some
      o arquivo, não o registro de que o cliente mandou algo.

Se um dia a frequência diária apertar, há duas saídas sem custo: o Cron Trigger
de Workers da Cloudflare (conta que já vai existir por causa do R2) ou um
workflow agendado no GitHub Actions chamando a rota com o secret.

### Tarefa 12 — Enviar imagem ao cliente: API

Hoje `POST /conversations/:id/reply` só manda texto, e o
`ConversationMessengerService` é o único lugar autorizado a mandar e gravar ao
mesmo tempo — é ele que ganha o caminho novo, não um atalho ao lado.

> Pré-requisito: plano `2026-09-22-reply-to-message.md`. Ele já deixa
> `WhatsAppClientService` preparado pra citar mensagem (`context.message_id`)
> de forma genérica, e toda mensagem de saída passa a devolver seu próprio
> `whatsappMessageId`. `sendImage` deve aceitar o mesmo
> `options?: { replyToWamid?: string }` que `sendText` ganhou lá, e
> `ConversationMessengerService.sendImage` o mesmo `replyToMessageId?` — assim
> imagem fica citável desde o primeiro dia, sem desenho novo.

- [ ] `WhatsAppClientService.uploadMedia(buffer, mimeType)`:
      `POST /v20.0/{phone-number-id}/media` (multipart), devolve um `media_id`.
- [ ] `WhatsAppClientService.sendImage(to, mediaId, caption?, options?: { replyToWamid?: string })`:
      mensagem do tipo `image` referenciando o id, citando quando informado.
- [ ] `ConversationMessengerService.sendImage(..., replyToMessageId?: string)`: sobe pro R2 **e** pra Meta,
      manda, e grava a mensagem `outbound` com `kind: 'image'`, o `mediaKey`,
      e `repliedToId`/`repliedToWamid`/`whatsappMessageId` do mesmo jeito que
      `sendText` já faz. Subir nos dois é proposital: o id da Meta expira, o
      nosso histórico não.
- [ ] Endpoint de envio aceitando o arquivo, com `ClerkAuthGuard`, os mesmos
      limites de tamanho e mime da Tarefa 3, e a regra de status que o reply de
      texto já tem (só `paused_human`).
- [ ] ⚠️ **Janela de 24 horas.** A Meta só aceita mensagem livre dentro de 24h
      da última mensagem do cliente; fora disso, só template. Isso **já vale
      hoje para o reply de texto** e não é problema novo, mas com imagem o erro
      fica mais visível. Decidir se o admin passa a mostrar quando a janela
      fechou, em vez de deixar o envio falhar.

### Tarefa 13 — Enviar imagem ao cliente: admin

- [ ] Anexo no campo de resposta em `src/app/admin/conversas/[id]/page.tsx`,
      com pré-visualização antes de enviar.
- [ ] Validar tamanho e tipo no navegador antes de subir, para o operador não
      descobrir o limite depois do upload.
- [ ] A mensagem enviada aparece na thread como as outras `outbound`, usando o
      mesmo componente de imagem da Tarefa 7.

---

## Como testar

O projeto é coberto por testes e essas tarefas tocam o caminho mais quente que
existe aqui, então vale dizer onde cada coisa é verificável sem rede:

- **Download da Meta** (Tarefa 3): `global.fetch` mockado, como já é feito em
  `cep-lookup.service.spec.ts` — inclusive o caso do prazo estourado.
- **Storage** (Tarefa 4): `MediaStorageService` existe justamente para ser
  substituível; os testes do bot engine mockam a interface e nunca falam com o
  R2.
- **Fluxo do bot** (Tarefa 5): `bot-engine.service.spec.ts` já tem
  `mediaMessagePayload(from, type)` pronto, e os casos novos (imagem durante a
  espera do CEP, imagem com e sem legenda) entram ao lado dos que já existem.
- **Admin** (Tarefas 7 e 8): `navigator.share` e `navigator.canShare` precisam
  ser mockados; o caminho sem suporte é tão importante quanto o com.
- **Retenção** (Tarefa 11): a seleção do que apagar é uma consulta pura —
  testável sem tocar no R2, que é o ponto de separar decisão de execução.

## Ordem sugerida

**Feito:** Tarefas 1, 2, 3, 4, 5, 10 e a metade ao vivo da 11. A imagem já
vira mensagem comum — baixada da Meta, guardada no R2, com teto de 8 GB
respeitado desde a primeira foto — exibi-la no histórico é o que falta.
Testada inteira contra storage mockado, como o plano previa. A medição real
do R2 foi feita (Tarefa 4); a do lado da Meta segue pendente por falta de
uma foto de teste de verdade, mas não bloqueia nada.

**Próximo passo:** Tarefas 6 e 7 (API de leitura e exibição no admin) — é
onde o operador finalmente vê a imagem que já está sendo recebida e
guardada. Em paralelo, vale fechar a UI de aviso graduado do teto de
armazenamento (o número já está exposto em `GET /bot-settings`), que é
trabalho de frontend fora do que esta sessão tocou.

Depois:

1. **Tarefa 9** — prévia da notificação push.
2. **Tarefa 8** — compartilhar.
3. **Tarefas 12 e 13** — enviar imagem ao cliente.
4. **O cron da 11** — faxina e conferência.

⚠️ **A Tarefa 11 não é uma coisa só, e as duas metades não vão juntas.** O
contador é escrito na mesma transação que grava a mensagem, então ele **nasce
junto com a Tarefa 4** — deixá-lo para depois significa rodar sem teto nenhum,
e é o teto que segura o custo. Já o cron (faxina dos 3 anos e conferência) pode
esperar de verdade: no primeiro ano não há sequer o que apagar.

## O que este plano deliberadamente não faz

- **Não trata áudio.** Decisão 3: áudio ganha plano próprio, escrito a partir do
  que funcionar aqui — e terá que refazer a conta de armazenamento, porque
  áudio não cabe na mesma margem.
- **Não gera thumbnail.** Imagem do WhatsApp já vem comprimida; redimensionar
  custa CPU no serverless para ganho pequeno.
- **Não recupera as imagens já perdidas.** Nada do que chegou antes foi baixado,
  e o id de webhook expira em 7 dias.
- **Não implementa envio ao Drive pelo servidor** (ver Tarefa 8).

---

## Fontes (conferir antes de decidir — mudam)

- [Cloudflare R2](https://www.cloudflare.com/products/r2/) e [free tier](https://r2drop.com/blog/cloudflare-r2-free-tier-guide)
- [Meta — Media (Cloud API)](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media) e [Media Download API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api)
- [Vercel Blob — uso e preço](https://vercel.com/docs/vercel-blob/usage-and-pricing) · [Supabase — free tier](https://www.itpathsolutions.com/supabase-free-tier-limits) · [Cloudinary — plano free](https://cloudinary.com/documentation/developer_onboarding_faq_free_plan)
