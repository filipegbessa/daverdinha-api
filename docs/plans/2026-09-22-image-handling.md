# Recebimento e exibição de imagens — plano de implementação

> **Status:** plano, nada implementado. Escrito em 2026-09-22.

**Objetivo:** aceitar imagens que o cliente manda pelo WhatsApp, guardá-las de
forma durável e exibi-las no histórico do admin — gastando zero ou perto disso.

**Hoje:** imagem cai no bucket de conteúdo inválido (`kind: invalid_content`,
corpo `[Conteúdo inválido]`) e o bot responde que não lê esse tipo de mensagem.
A imagem em si nunca é baixada. Este plano reverte isso **só para imagem**;
áudio, vídeo, figurinha e documento continuam como estão.

---

## O que decide o desenho: três prazos da Meta

Estes números não são negociáveis e definem quase tudo abaixo:

| Prazo | Valor | Consequência |
|---|---|---|
| URL de download | **5 minutos** | Não dá para baixar depois, com calma. Tem que ser na hora. |
| Media ID vindo de webhook | **7 dias** | **Mata a ideia mais barata de todas** (ver Opção F). |
| Arquivo nos servidores da Meta | 30 dias | Irrelevante, porque o id do webhook morre antes. |

O download também é em duas etapas, ambas autenticadas com o
`WHATSAPP_CLOUD_API_TOKEN`: `GET /v20.0/{media-id}` devolve um JSON com a `url`,
e só então se baixa a `url` mandando o `Bearer` de novo (ela não é pública).

---

## Onde guardar: comparação

Premissa de volume, para dimensionar: o WhatsApp já entrega a foto comprimida,
tipicamente 100–400 KB. A 30 fotos/dia a ~300 KB dá **~270 MB/mês**.

| Opção | Grátis | Serve aqui? |
|---|---|---|
| **A. Cloudflare R2** | 10 GB + **egress zero** | ✅ **Recomendada.** ~3 anos de margem no volume acima. Egress grátis é o que importa: exibir imagem é ler muitas vezes. |
| B. Vercel Blob | 1 GB | Integração mais simples (já estamos na Vercel), mas 1 GB é ~4 meses, e o tráfego sai da mesma cota Hobby que as páginas gastam. |
| C. Supabase Storage | 1 GB | ❌ Projeto free **pausa após 7 dias sem uso**. Inaceitável para armazenamento. |
| D. Cloudinary | 25 créditos/mês | Bom se quisermos thumbnail/resize de graça, mas **cada transformação consome crédito** — o custo vira imprevisível. |
| E. `bytea` no Postgres | 0,5 GB do Neon free | ❌ Compartilha a cota com todo o resto do banco, infla backup e deixa `SELECT` de conversa pesado. |
| F. Guardar só o media id e buscar sob demanda | R$ 0 | ❌ **Inviável:** o id de webhook expira em 7 dias. A imagem sumiria sozinha. |

**Recomendação: R2 (A).** Se a prioridade for "menos peça nova possível" em vez
de custo, Vercel Blob (B) é o plano B aceitável, sabendo que aguenta ~4 meses.

### Privacidade — não é detalhe

Clientes mandam **comprovante de pagamento**. Bucket público com URL adivinhável
vaza comprovante. Portanto: bucket **privado**, e a imagem chega ao admin por
**URL pré-assinada de vida curta** gerada sob demanda por rota com
`ClerkAuthGuard`. Pré-assinada em vez de proxy pela API porque o egress do R2 é
grátis e o da Vercel não.

---

## Restrições do projeto (herdadas)

- **Vercel serverless**: sem disco persistente e sem processo em background —
  o que não acontecer dentro da requisição não acontece.
- **Webhook tem que responder rápido**: a Meta reentrega tudo que não receber
  `200`, e reentrega replaya a mensagem. Baixar + subir a imagem dentro do
  webhook é o risco central deste plano (ver Tarefa 4).
- **Migration única**: o projeto squasha todo o histórico num único `_init`.
  Ao mexer no `schema.prisma`, apague a pasta existente e regenere uma só.
- Testes ficam ao lado do arquivo testado, dentro de `src/` (`rootDir: 'src'`).

---

## Tarefas

### Tarefa 1 — Schema

- [ ] Adicionar `image` ao enum `MessageKind` (hoje `text | invalid_content | order`).
- [ ] Adicionar em `Message` colunas anuláveis: `mediaKey` (chave no bucket),
      `mediaMimeType`, `mediaSizeBytes`, `mediaCaption`.
- [ ] Regenerar a migration única.

Colunas em `Message` em vez de tabela nova: é sempre 1:1 com a mensagem, e a
leitura da thread não ganha um `join`.

### Tarefa 2 — Parser do webhook

- [ ] `parseIncomingMessage` (`src/whatsapp/incoming-message.ts`) hoje **não
      extrai mídia nenhuma**. Adicionar `image?: { id, mime_type, sha256, caption }`
      à interface `IncomingMessage` e ao mapeamento.

### Tarefa 3 — Cliente de mídia

- [ ] `WhatsAppClientService.downloadMedia(mediaId)`: `GET /v20.0/{id}` → pega
      `url` → baixa com `Bearer`. Devolve `{ buffer, mimeType, sizeBytes }`.
- [ ] Guardrails: timeout curto, teto de tamanho (a Meta já limita imagem a 5 MB),
      allowlist de mime (`image/jpeg`, `image/png`, `image/webp`).

### Tarefa 4 — Armazenamento (⚠️ a decisão de risco)

- [ ] `MediaStorageService` com uma interface só (`put(key, buffer, mime)` +
      `signedUrl(key)`), para trocar R2 por Blob sem mexer no resto.
- [ ] R2 fala S3: dá para usar `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- [ ] Chave sem nada adivinhável: `conversations/{conversationId}/{uuid}.jpg`.

**Medir antes de fechar:** baixar da Meta + subir no R2 dentro do webhook, com
uma foto de ~400 KB. Se passar de ~2 s, mudar de abordagem — e a saída **não** é
"responder 200 antes e processar depois" (no serverless a função morre no
`return`). As saídas reais são: (a) gravar a mensagem já com o `media_id` e a
imagem pendente, e baixar no primeiro acesso do admin — só funciona dentro da
janela de 7 dias, ou (b) uma fila (QStash/Upstash tem free tier).

### Tarefa 5 — Bot engine

- [ ] Tirar `image` do caminho de conteúdo inválido criado em 2026-09-22
      (`isUnsupportedContent`), passando a gravar `kind: 'image'`.
- [ ] Manter a regra que acabamos de estabelecer: o tratamento roda **acima** do
      return de `paused_human`, para a foto não sumir quando tem humano atendendo.
- [ ] Decidir a resposta do bot à foto — provavelmente **nenhuma** em
      `paused_human`, e em `bot_active` algo como "recebemos sua imagem, já te
      respondo" em vez do atual "não é válido por aqui".
- [ ] Se falhar o download, gravar como `invalid_content` e não perder a mensagem.

### Tarefa 6 — API de leitura

- [ ] `GET /conversations/:id/messages/:messageId/media` com `ClerkAuthGuard`,
      devolvendo redirect 302 para a URL pré-assinada (TTL de minutos).
- [ ] Não embutir a URL assinada no payload da thread: ela expira, e a thread
      fica em cache no cliente.

### Tarefa 7 — Admin

- [ ] Renderizar `kind === 'image'` em `src/app/admin/conversas/[id]/page.tsx`
      (o `switch` de bolha por `kind` já existe), com `<img>` apontando para a
      rota da Tarefa 6, `loading="lazy"` e clique para abrir em tamanho cheio.
- [ ] Adicionar `'image'` ao tipo `MessageKind` em `src/features/admin/types/admin.ts`.

### Tarefa 8 — Push

- [ ] Prévia da notificação: `📷 Foto` (ou a legenda, se houver) em vez do corpo
      cru, no `ConversationNotifierService` — o mesmo ponto onde o pedido de
      catálogo já vira "Novo pedido pelo catálogo".

### Tarefa 9 — Retenção

- [ ] Sem isso o custo é só uma questão de tempo. Um cron (Vercel Cron tem free
      tier) apagando objeto com mais de N meses e limpando `mediaKey`, deixando a
      mensagem no histórico marcada como imagem expirada.

---

## O que este plano deliberadamente não faz

- **Não baixa mídia que não seja imagem.** Áudio e vídeo pesam muito mais e
  queimariam os 10 GB rápido. Continuam como `invalid_content`.
- **Não gera thumbnail.** Imagem do WhatsApp já vem comprimida; redimensionar
  custa CPU no serverless ou crédito no Cloudinary, para ganho pequeno.
- **Não recupera as imagens já perdidas.** Tudo que chegou antes disso não foi
  baixado, e o id de webhook expirou em 7 dias.

---

## Fontes de preço (conferir antes de decidir — mudam)

- [Cloudflare R2 — produto](https://www.cloudflare.com/products/r2/) e [free tier](https://r2drop.com/blog/cloudflare-r2-free-tier-guide)
- [Vercel Blob — uso e preço](https://vercel.com/docs/vercel-blob/usage-and-pricing) e [plano Hobby](https://vercel.com/docs/plans/hobby)
- [Supabase — limites do free tier](https://www.itpathsolutions.com/supabase-free-tier-limits)
- [Cloudinary — plano free](https://cloudinary.com/documentation/developer_onboarding_faq_free_plan)
- [Meta — Media (Cloud API)](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media) e [Media Download API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api)
