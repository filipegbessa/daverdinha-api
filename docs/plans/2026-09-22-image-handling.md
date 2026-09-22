# Recebimento, exibição e compartilhamento de imagens — plano de implementação

> **Status:** plano, nada implementado. Escrito em 2026-09-22, decisões do dono
> do projeto incorporadas em 2026-09-22.

**Objetivo:** receber a imagem que o cliente manda pelo WhatsApp como mais uma
mensagem da conversa, guardá-la de forma durável, exibi-la no histórico do
admin, permitir que o operador a compartilhe (baixar no aparelho ou mandar para
o Google Drive) e permitir que ele **envie** imagem ao cliente — gastando zero
ou perto disso.

**Hoje:** imagem cai no bucket de conteúdo inválido (`kind: invalid_content`,
corpo `[Conteúdo inválido]`) e o bot responde *"Esse tipo de mensagem não é
válido por aqui!"*. A imagem nunca é baixada.

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

---

## Tarefas

### Tarefa 1 — Schema

- [ ] Adicionar `image` ao enum `MessageKind` (hoje `text | invalid_content | order`).
- [ ] Adicionar em `Message` colunas anuláveis: `mediaKey` (chave no bucket),
      `mediaMimeType`, `mediaSizeBytes`.
- [ ] Regenerar a migration única.

Sem coluna própria para legenda: `image.caption` do webhook chega e é
gravado em `body`, o mesmo campo que qualquer mensagem de texto já usa — é
o que a Tarefa 5 grava e a Tarefa 7 lê, sem campo novo na interface `Message`
do frontend.

Colunas em `Message` em vez de tabela nova: é sempre 1:1 com a mensagem, e a
leitura da thread não ganha um `join`.

### Tarefa 2 — Parser do webhook

- [ ] `parseIncomingMessage` (`src/whatsapp/incoming-message.ts`) hoje **não
      extrai mídia nenhuma**. Adicionar `image?: { id, mime_type, sha256, caption }`
      à interface `IncomingMessage` e ao mapeamento.
- [ ] A legenda vem em `image.caption`, **não** em `text.body`. Ela é guardada e
      exibida (decisão 6), mas **não** entra no cálculo de `text` em
      `bot-engine.service.ts:111` — é esse detalhe que mantém a legenda fora das
      decisões do bot. Manter os dois campos separados é o que implementa a
      regra "conteúdo, não comando"; bastaria juntá-los para quebrá-la sem
      querer.

### Tarefa 3 — Cliente de mídia

- [ ] `WhatsAppClientService.downloadMedia(mediaId)`: `GET /v20.0/{id}` → pega
      `url` → baixa com `Bearer`. Devolve `{ buffer, mimeType, sizeBytes }`.
- [ ] **Prazo obrigatório nas duas chamadas** (`AbortSignal.timeout`), pelo mesmo
      motivo que o `CepLookupService` ganhou o dele: chamada externa sem prazo
      dentro do webhook segura a requisição até o teto de 30s da Vercel.
- [ ] Guardrails: teto de tamanho (a Meta já limita imagem a 5 MB) e allowlist
      de mime (`image/jpeg`, `image/png`, `image/webp`).

### Tarefa 4 — Armazenamento (⚠️ a decisão de risco)

- [ ] `MediaStorageService` com interface enxuta (`put(key, buffer, mime)` +
      `signedUrl(key, { download? })`), para trocar de provedor sem mexer no resto.
- [ ] Chave sem nada adivinhável: `conversations/{conversationId}/{uuid}.jpg`.

**Medir antes de fechar:** baixar da Meta + subir no R2 dentro do webhook, com
uma foto de ~400 KB. Estimativa de 300 ms a 1,5 s, mas é número para medir, não
para supor.

**O que mudou a favor da abordagem síncrona:** o commit `b294075d` passou a
devolver a reivindicação do `wamid` quando o processamento falha. Antes, uma
falha no meio do download deixava o wamid reivindicado e a reentrega da Meta
era descartada — a mensagem sumia. Agora a falha vira nova tentativa. Isso torna
"baixar dentro do webhook" bem mais defensável do que era.

Se a medição reprovar, as saídas são: (a) gravar a mensagem com o `media_id` e
baixar no primeiro acesso do admin — só funciona dentro da janela de 7 dias, ou
(b) uma fila (QStash/Upstash tem free tier).

### Tarefa 5 — Bot engine: imagem vira mensagem comum

- [ ] Tirar `image` de `isUnsupportedContent` (`bot-engine.service.ts`). Áudio,
      vídeo, figurinha e documento continuam como conteúdo inválido.
- [ ] Gravar como `kind: 'image'`, com a legenda do cliente no `body` quando
      houver.
- [ ] Se o download falhar depois dos retries, gravar como `invalid_content`
      para não perder o registro de que algo chegou.

**Imagem durante a espera do CEP** (decisão 6). `isDeliveryReply` exige `!!text`
(`bot-engine.service.ts:117`), e a legenda não conta como texto — então a
imagem nunca vira resposta de CEP. Sem tratamento, ela escorreria até
`handleMenuSelection` e reexibiria o menu, cancelando o fluxo. O correto é
desviá-la para o caminho de "CEP não entendido", que já existe:

- [ ] Com `awaitingDeliveryReply` ligado e chegando imagem: gravar a imagem
      (com a legenda) e então rodar `registerUnresolvedAttempt`.
- [ ] ⚠️ **Não dá para chamar `DeliveryCheckService.handleReply`**: ele grava a
      mensagem por conta própria como texto (`delivery-check.service.ts:47`), e
      aqui a gravação é a da imagem. Precisa de uma entrada pública nova que só
      registre a tentativa não resolvida, sem gravar nada.

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

### Tarefa 6 — API de leitura

- [ ] `GET /conversations/:id/messages/:messageId/media` com `ClerkAuthGuard`,
      devolvendo redirect 302 para a URL pré-assinada (TTL de minutos).
- [ ] Parâmetro `?download=1` que gera a URL com
      `response-content-disposition=attachment`, que é o que faz o navegador
      salvar em vez de abrir.
- [ ] Não embutir a URL assinada no payload da thread: ela expira, e a thread
      fica em cache no cliente.

### Tarefa 7 — Admin: exibir

- [ ] Renderizar `kind === 'image'` em `src/app/admin/conversas/[id]/page.tsx`
      (o `switch` de bolha por `kind` já existe), com `<img>` apontando para a
      rota da Tarefa 6, `loading="lazy"` e clique para abrir em tamanho cheio.
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

### Tarefa 9 — Prévia da notificação push

O `ConversationNotifierService` monta o corpo do push a partir da última
mensagem recebida. Com `kind: 'image'` isso fica errado dos dois lados: hoje o
operador receberia `[Conteúdo inválido]`, e depois da Tarefa 5 receberia
`Nova mensagem` sempre que a foto vier sem legenda — o mesmo lugar onde o
pedido de catálogo já vira "Novo pedido pelo catálogo".

- [ ] Prévia `📷 Foto` para imagem sem legenda, e `📷 <legenda>` quando houver.
- [ ] A prévia já passa por `truncateBody` (120 caracteres), então legenda longa
      não precisa de tratamento próprio.

### Tarefa 10 — Configuração do R2

Mecânico, mas é o que faz o resto rodar, e não estava escrito em lugar nenhum.

- [ ] Criar o bucket, **privado** (a Tarefa 4 depende disso).
- [ ] Token de API do R2 com escopo só nesse bucket, não na conta inteira.
- [ ] Variáveis novas: endpoint da conta, bucket, access key id e secret.
      Acrescentar ao `.env.example` **e** ao painel da Vercel — o `.env` não é
      versionado, então quem só olha o repositório não descobre sozinho.
- [ ] Sem CORS no bucket: o navegador nunca fala com o R2 direto, ele segue o
      redirect da rota da Tarefa 6 para uma URL assinada.
- [ ] `CRON_SECRET` também entra aqui — é o que protege a rota de purga da
      Tarefa 11, e sem ela a rota que apaga imagens fica aberta.

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

#### O contador é ao vivo, não do cron

O uso é somado **na mesma transação que grava a mensagem**, dentro do
`ConversationMessengerService` — que já é o único lugar autorizado a gravar
mensagem, então é onde o número não tem como divergir.

- [ ] Guardar **bytes em uso**, não um booleano "cheio". O bloqueio vira uma
      comparação contra o teto, e o admin consegue avisar de forma graduada
      ("7,2 GB de 8 GB") em vez de o operador descobrir quando as fotos já
      pararam de chegar.
- [ ] Teto de **8 GB**, deixando 2 GB dos 10 GB gratuitos como folga.
- [ ] O fluxo da Tarefa 5 lê esse número **antes** de baixar da Meta. Acima do
      teto: nem baixa, nem sobe — segue direto o caminho de conteúdo inválido.

⚠️ **Por que ao vivo e não no cron:** o cron do plano Hobby roda no máximo uma
vez por dia. Se fosse ele a descobrir que encheu, bastaria despejar imagens logo
depois de uma execução para o sistema seguir salvando por 24h sem barrar nada —
e a Meta aceita imagem de até 5 MB. Com o contador em transação, o bloqueio é
imediato e essa janela não existe.

⚠️ **Isto muda o que a Tarefa 5 pode remover.** O caminho de conteúdo inválido
para imagem **não é código morto** — vira o modo degradado. Tirar `image` de
`isUnsupportedContent` não pode significar apagar a capacidade de tratá-la assim.

⚠️ **Degradar em silêncio é o pior desfecho possível.** As fotos param de chegar
e ninguém percebe. O Dashboard já é onde mora o alerta de "bot desativado por
falta de item de menu"; o mesmo padrão serve aqui, e o aviso deve começar antes
do teto, não nele.

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

1. **Tarefas 1, 2, 3, 4, 10, e o contador da 11** — a imagem chega, fica
   guardada e o teto já é respeitado. Nada aparece ainda, mas para de se perder,
   que é o prejuízo que está correndo hoje.
2. **Tarefas 5, 7, 9** — a imagem aparece no histórico e na notificação. É aqui
   que o operador sente a mudança.
3. **Tarefas 6 e 8** — baixar e compartilhar.
4. **Tarefas 12 e 13** — enviar imagem ao cliente. Depende da 4 (mesmo storage)
   e da 7 (mesmo componente de exibição).
5. **O cron da 11** — faxina e conferência.

⚠️ **A Tarefa 11 não é uma coisa só, e as duas metades não vão juntas.** O
contador é escrito na mesma transação que grava a mensagem, então ele **nasce
junto com a Tarefa 4** — deixá-lo para depois significa rodar sem teto nenhum,
e é o teto que segura o custo. Já o cron (faxina dos 3 anos e conferência) pode
esperar de verdade: no primeiro ano não há sequer o que apagar.

A **Tarefa 4** entra cedo de propósito por outro motivo: é a única que pode
derrubar o desenho inteiro, dependendo da medição dentro do webhook.

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
