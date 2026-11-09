# Loja online V1 — plano de implementação (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Histórico de revisões**
> - **2026-11-06:** vai ter estoque (Tarefa 4 obrigatória); venda de ingresso pros eventos da agenda, em compra separada, com nome por participante e inscrição gratuita pelo site (decisões 12–18, Tarefas 11–13).
> - **2026-11-09:** **pagamento pelo Pagar.me (Stone)**, não mais Mercado Pago — decidido; boleto confirmado fora. Produto **sob encomenda** ganha prazo de confecção e selo próprio; esgotado continua esgotado. Frete por **área de entrega** (subdivisão das zonas, com valor próprio) no lugar do valor por zona. **Retirada configurada no admin** (endereço, horário), começando com o endereço do ateliê. **Máximo de ingressos por compra configurável por evento** (padrão 10). **Cartão à vista ou parcelado, sem juros pro comprador**, com número máximo de parcelas e parcela mínima configurados no admin (decisão 19).
> - **2026-11-09 (docs do Pagar.me lidas):** o checkout passa a ser criado por **link de pagamento** (`POST /paymentlinks`, o fluxo documentado pra checkout hospedado), não por `POST /orders`. A referência lida está em "Referência do Pagar.me", logo abaixo das decisões; o Step 0 da Tarefa 6 ficou só com o que a documentação não responde.

**Goal:** a cliente final compra pelo site: monta o carrinho, escolhe entrega ou retirada, paga no Pagar.me (checkout hospedado, fora do site) e volta pra uma página do pedido. Também compra ingresso (ou se inscreve, se o evento é gratuito) direto na página do evento. A Daverdinha vê e acompanha os pedidos no mesmo admin das conversas, recebe push de venda nova, cadastra áreas de entrega com valor, retirada, estoque e prazo de encomenda, e tem a lista de presença de cada evento.

**Plano irmão:** `daverdinha/docs/plans/2026-11-05-loja-online-v1.md` (telas do admin, carrinho, checkout, página do pedido, ingresso na página do evento). Os contratos de API abaixo são a fonte da verdade pros dois.

**Onde estamos:**

| Parte | Situação |
|---|---|
| Catálogo — API (`src/product-categories`, `src/products`, Blob) | ✅ feito (`docs/plans/2026-11-04-catalogo-produtos.md`) e delta aplicado na Neon. Falta só `npx prisma migrate resolve --applied 20261104204120_init` em produção. |
| Catálogo — vitrine e cadastro no admin | ✅ feitos (plano irmão, Fase 1); falta a verificação com a API real (Tarefa 4 de lá) |
| Checagem de CEP compartilhada (bot + site) | ✅ Tarefa 2 (2026-11-09) |
| Loja V1 — produtos | ✅ Tarefas 1, 3, 4 e 5 (2026-11-09; delta da Tarefa 1 aplicado na Neon). ⏳ Tarefas 6–10: a 6 (Pagar.me) espera a chave de teste da conta da cliente |
| Agenda de eventos — API | ⏳ `docs/plans/2026-11-04-agenda-eventos.md`, Tarefas 1–5 (pré-requisito dos ingressos) |
| Loja V1 — ingressos | ⏳ Tarefas 11–13 deste plano |
| Fechamento (e2e, docs, produção) | ⏳ Tarefa 14 |
| V2 — pagamento dentro do site, e-mails, "avise-me" | fora deste plano (ver "Depois da V1") |

**Architecture:** módulos novos seguindo o padrão do catálogo — service + controller admin com `ClerkAuthGuard` + **controller público separado**, registrado antes do admin:

- `src/pagarme/` — único lugar que fala com o Pagar.me (API REST v5 via `fetch`, sem SDK): criar o link de pagamento (checkout hospedado), buscar a cobrança, autenticar o webhook. Os outros módulos dependem só da interface `PaymentGateway`. Mesmo papel que `WhatsAppClientService` tem pro WhatsApp.
- `src/checkout/` — público: cotar carrinho (`POST /checkout/quote`), criar pedido (`POST /checkout`), comprar ingresso (`POST /checkout/tickets`), ver pedido pelo token (`GET /checkout/orders/:token`), webhook (`POST /webhooks/pagarme`).
- `src/site-orders/` — regras do pedido (preço, frete, estoque, vagas, máquina de status) e o admin (`/site-orders`, lista de presença).
- `src/store-settings/` — configurações da loja editadas no admin (retirada: ligada/desligada, endereço, horário, instruções).
- Áreas de entrega ficam em `src/delivery-locations/` (já é dono de bairros, zonas e CEP).

**Ingresso é um `SiteOrder` de outro tipo** (`kind: 'tickets'`), não um sistema paralelo: o mesmo pagamento, webhook, reconciliação, vencimento, página pública e admin de pedidos servem pros dois. O que muda é a entrada (`POST /checkout/tickets`, um evento por pedido, sem carrinho nem entrega) e o que é reservado (vaga do evento em vez de estoque de produto).

**O preço e o frete são sempre calculados no servidor.** O carrinho do site manda só `{ productId, quantity }`; nome, preço e frete vêm do banco na hora de criar o pedido e ficam congelados no pedido (snapshot). O Pagar.me recebe os itens já com o preço do servidor, em centavos.

**O webhook é só um aviso; a fonte da verdade é a consulta ao Pagar.me.** A volta do cliente pro site (`success_url`) só mostra a página do pedido — não muda status. O corpo do webhook também não é usado pra decidir nada: a API pega o id da cobrança que veio nele e chama `GET /charges/:id`. Assim, um aviso forjado não consegue marcar pedido como pago, mesmo que passe pela autenticação.

**Tech Stack:** NestJS 11, Prisma 5 (Postgres/Neon), API Pagar.me v5 (`https://api.pagar.me/core/v5`; sandbox `https://sdx-api.pagar.me/core/v5`; Basic Auth com a chave secreta `sk_…`), `web-push` (já instalado), class-validator.

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Checkout hospedado do Pagar.me por link de pagamento (redirect).** A API cria um link por pedido (`POST /paymentlinks`, `type: 'order'`, `max_paid_sessions: 1`, `expires_in` alinhado ao pedido); a resposta traz `id` (`pl_…`) e `url`. O cliente paga em `checkout.pagar.me` e volta pra `daverdinha.com.br/pedido/<token>` (`flow_settings.success_url`). **Pix e cartão (à vista ou parcelado, decisão 19)**; **boleto fora** (confirmado pela cliente em 2026-11-09). O link leva `order_code` = nosso `DV-0001` (campo de correlação do Pagar.me) e guardamos o `pl_…` no pedido — é por eles que o webhook e a reconciliação acham o `SiteOrder`. |
| 2 | **`SiteOrder`, não `Order`.** O model `Order`/`OrderItem` já existe e é o pedido de catálogo que chega pelo WhatsApp (`handleOrderMessage`). O pedido do site ganha models próprios: `SiteOrder`/`SiteOrderItem`, tabelas `site_orders`/`site_order_items`, rotas `/site-orders`. |
| 3 | **Código do pedido legível + token secreto.** `number` autoincremento vira `DV-0001` (o que a cliente e o cliente falam no WhatsApp). A página pública do pedido usa `publicToken` (uuid), nunca o número — senão qualquer um enumera `DV-0001`, `DV-0002`… e lê dados alheios. |
| 4 | **Frete por área de entrega.** Os bairros (`DeliveryLocation`) já são agrupados por `zone`. Cada zona ganha **subdivisões** (`DeliveryArea { zone, name, fee }`) cadastradas pela cliente, e cada bairro coberto pertence a no máximo uma área da sua zona. Frete = valor da área do bairro do CEP. CEP não resolvido, bairro não atendido ou bairro sem área ⇒ entrega indisponível (o site oferece retirada ou WhatsApp). **Nunca** cobrar frete zero por falta de cadastro. |
| 5 | **Retirada configurada no admin** (`StoreSettings`: ligada/desligada, endereço, horário, instruções), começando com o endereço do ateliê (R. Capiberibe, 32 - Santo Cristo). Retirada desligada some do checkout. Frete da retirada é sempre 0. |
| 6 | **Estoque e sob encomenda** (Tarefa 4). `Product.stock Int?`: com número, o produto é **pronta entrega** — pedido pendente reserva (conta contra o disponível até `expiresAt`), pedido pago baixa o estoque, e disponível 0 é **esgotado** (não vende; o "avise-me" fica pra V2). `stock: null` é **sob encomenda**: vende sem limite e exige `leadTimeDays` (prazo de confecção, em dias), que o site mostra num selo ("Sob encomenda · até 10 dias"). Sem cron de liberação: a reserva vence sozinha porque o cálculo só soma pedidos pendentes com `expiresAt > now()`. |
| 7 | **Pedido pendente vence em 60 minutos** (`expiresAt`), e o checkout do Pagar.me vence junto (`expires_in` do checkout e do Pix alinhados), assim o Pagar.me não aceita pagamento depois. |
| 8 | **Pagamento recusado não cancela o pedido.** O cliente pode tentar de novo até `expiresAt`: o link aceita várias sessões e só se encerra na primeira paga (`max_paid_sessions: 1`, sem `max_sessions`). Só `paid` muda pra `paid`; `refunded`/`chargedback` mudam pra `refunded`. |
| 9 | **Avisos:** push no admin quando o pedido é **pago** (não quando é criado — pedido criado e abandonado é ruído). E-mail pro cliente na V1 é o comprovante que o próprio Pagar.me manda (conferir no Step 0 se vem ligado na conta); e-mail próprio fica pra V2 (ver "Depois da V1"). |
| 10 | **Cancelar pedido pago não estorna sozinho na V1.** O admin marca como cancelado (devolve o estoque) e o texto do botão avisa que o estorno é feito no painel do Pagar.me. Estorno pela API fica pra V2. |
| 11 | **Sem cron novo.** Vercel Hobby só roda cron diário. Reconciliação (webhook perdido) acontece quando alguém lê o pedido: a página pública e o admin chamam `syncWithGateway` se o pedido está pendente e não foi checado no último minuto (Tarefa 9). |
| 12 | **Ingresso em compra separada.** Não entra no carrinho: a página do evento tem o próprio formulário (participantes + dados do comprador) e manda direto pro pagamento. **Um evento por pedido**, sem entrega nem frete (`deliveryMethod: null`). |
| 13 | **Venda pelo site é ligada por evento** (`Event.ticketSales`, padrão `false`). Desligada, o evento continua como hoje (`ctaUrl` ou WhatsApp). Ligada, o site mostra "Comprar ingresso" (pago) ou "Inscrever-se" (gratuito) e ignora `ctaUrl`. |
| 14 | **Nome por ingresso.** Comprou 3, informa 3 nomes (`SiteOrderTicket.attendeeName`). **Máximo de ingressos por compra configurável por evento** (`Event.maxTicketsPerOrder`, padrão 10, de 1 a 50). O limite vale por pedido: a mesma pessoa pode comprar de novo (travar por e-mail fica pra depois, se precisar). O comprador não precisa ser um dos participantes. |
| 15 | **`spots` vira lotação de verdade quando `ticketSales` está ligado.** Vagas ocupadas = ingressos de pedidos `paid` + ingressos de pedidos `pending_payment` com `expiresAt > now` (mesma reserva sem cron do estoque). `spots: null` = sem limite. Diferente do estoque, `spots` **não é decrementado**: ele é a lotação, e "12 de 20 vendidos" sai da contagem — cancelar ou estornar libera a vaga sem mexer em número nenhum. |
| 16 | **Evento gratuito também inscreve pelo site**, sem passar pelo Pagar.me: o pedido nasce `paid` com total 0 (`paidAt = now`, sem `paymentUrl`), reserva a vaga e dispara o push. "Pago" com total 0 aparece como "Inscrição confirmada" no site e no admin. |
| 17 | **Venda fecha quando o evento começa.** `POST /checkout/tickets` depois de `startsAt` → 409 `not_available`; o pedido pendente vence em `min(now + 60 min, startsAt)`. |
| 18 | **Lista de presença no admin** por evento: participantes de pedidos `paid`, com check-in (marcar/desmarcar presença). O ingresso é a página do pedido (`/pedido/<token>`) com os nomes; QR code fica pra depois. |
| 19 | **Parcelamento no cartão** (confirmado pela cliente em 2026-11-09). Configurado no admin em `StoreSettings`: `maxInstallments` (1–12, padrão 3) e `minInstallmentValue` (padrão R$ 30). Parcelas oferecidas num pedido = `min(maxInstallments, floor(total / minInstallmentValue))`, no mínimo 1 (à vista). **Sem juros pro comprador**: a taxa do parcelamento fica com a loja (o valor cobrado é sempre o `total`). Se a cliente preferir juros pro comprador, o Pagar.me já suporta no próprio link (`installments_setup.free_installments` menor que o máximo + `interest_rate`): vira mais dois campos em `StoreSettings`, sem mudar o fluxo. Vale pra produtos e ingressos. |

## Referência do Pagar.me (lida em 2026-11-09)

Fontes: `docs.pagar.me/docs/conecte-o-checkout-pagarme-usando-ia`, `docs/llms.md`, `docs/checkout_pagarme_skill_order.md`, `reference/criar-link.md`, `reference/checkout-response.md`, `reference/eventos-de-webhook-1.md`, `reference/visão-geral-sobre-webhooks.md`.

- **Ambientes:** sandbox `https://sdx-api.pagar.me/core/v5` (`sk_test_…`), produção `https://api.pagar.me/core/v5` (`sk_live_…`). Basic Auth com a chave secreta como usuário e senha vazia. Header `User-Agent` obrigatório.
- **Criar link:** `POST /paymentlinks`. Obrigatórios: `type: 'order'`, `payment_settings`, `cart_settings.items[]` (`name`, `amount` em centavos, `default_quantity`). Usados aqui:
  - raiz: `name` (≤ 64, "Pedido DV-0001"), `order_code` (`DV-0001`), `expires_in` (**minutos**; nunca junto com `expires_at`), `max_paid_sessions: 1`;
  - `payment_settings`: `accepted_payment_methods: ['credit_card', 'pix']`, `statement_descriptor` (≤ 13, ex. `DAVERDINHA`), `credit_card_settings` (obrigatório com cartão): `operation_type: 'auth_and_capture'` e `installments_setup: { max_installments, amount, free_installments, interest_rate, interest_type }` (sem juros pro comprador = `free_installments = max_installments`; não mandar junto com `installments`), `pix_settings.expires_in` (**segundos**);
  - `cart_settings.shipping_cost` (centavos) pro frete — não é item;
  - `customer_settings.customer`: `name` (obrigatório, ≤ 64), `email`, `type: 'individual'`, `phones.mobile_phone { country_code, area_code, number }`, `code` (nosso id). CPF (`document`) é opcional na criação;
  - `layout_settings`: `image_url` (logo), `primary_color`;
  - `flow_settings.success_url`: volta do comprador pra loja.
- **Resposta:** `id` (`pl_…`), `url` (`https://checkout.pagar.me/…`), `status`, `total_sessions`, `total_paid_sessions`.
- **Cartão liquida em D+30 por padrão; Pix na hora.**
- **Webhooks:** configurados no painel, vários endpoints, cada um com seus eventos; só HTTPS. Eventos úteis: `charge.paid`, `charge.payment_failed`, `charge.refunded`, `chargeback.received` (`charge.chargedback` foi descontinuado em 30/09/2026), `order.paid`, `checkout.canceled`/`checkout.closed`. O objeto de webhook tem `id` (`hook_…`), `event`, `account`, `data` (o conteúdo do pedido/cobrança).
- **Teste:** cartão aprovado `4000000000000010`, recusado `4000000000000028`, qualquer CVV, validade futura; chave Pix de teste no painel.
- **Não documentado** (fica pro Step 0 da Tarefa 6): autenticação do webhook (assinatura ou Basic Auth); se o pedido gerado pelo link carrega `order_code` como `code`; como achar o pedido/cobrança de um link sem webhook (`GET /paymentlinks/:id` tem resposta vazia na doc); se o checkout pede CPF ao comprador; e-mail de comprovante.

**Pendente da conta Stone/Pagar.me da cliente** (esclarecer durante o desenvolvimento, quando ela trouxer as informações da conta; até lá valem os padrões do plano): plano contratado e taxas (Pix, crédito à vista, parcelado), prazo de recebimento, se a conta já tem acesso à API e ao sandbox, e o que isso muda no parcelamento (quantas parcelas, parcela mínima e se o "sem juros" compensa ou se os juros vão pro comprador). O código não depende desses números: parcelas e parcela mínima são configuração no admin. Entra no Step 0 da Tarefa 6.

**Pra confirmar com a cliente:** política de troca/devolução e de cancelamento de ingresso — respostas pelo questionário `daverdinha/docs/questionario-politicas.md`, que vira o texto das páginas (plano irmão, Tarefa 12).

## Contratos

```ts
// POST /checkout/quote  (público)
// body: { items: { productId: string; quantity: number }[]; cep?: string }
interface CheckoutQuote {
  items: {
    productId: string; name: string; slug: string; unitPrice: number; quantity: number; lineTotal: number; imageUrl: string | null;
    availability: 'in_stock' | 'made_to_order';    // esgotado vem em `problems`
    leadTimeDays: number | null;                    // só em made_to_order
  }[];
  subtotal: number;
  installments: number;   // máximo de parcelas sem juros pro total desta cotação (1 = só à vista); recalculado com o frete no checkout
  pickup: { available: true; address: string; hours: string; instructions: string | null } | { available: false };
  delivery:
    | { available: true; fee: number; bairro: string; area: string }
    | { available: false; reason: 'no_cep' | 'unresolved' | 'not_covered' | 'no_area'; bairro?: string };
  problems: { productId: string; reason: 'not_found' | 'inactive' | 'insufficient_stock'; available?: number }[];
}

// POST /checkout  (público)
// body: {
//   items: { productId: string; quantity: number }[];
//   customer: { name: string; email: string; phone: string };
//   deliveryMethod: 'pickup' | 'delivery';
//   address?: { cep: string; street: string; number: string; complement?: string };  // obrigatório se delivery
//   notes?: string;
// }
// 201 -> { code: 'DV-0001'; token: string; paymentUrl: string }
// 409 -> { message: string; problems: CheckoutQuote['problems'] }        // estoque/produto mudou
// 422 -> { message: string; reason: CheckoutQuote['delivery']['reason'] | 'pickup_disabled' }

// POST /checkout/tickets  (público, Tarefa 12)
// body: {
//   eventId: string;
//   attendees: { name: string }[];                       // 1 até Event.maxTicketsPerOrder
//   customer: { name: string; email: string; phone: string };
//   notes?: string;
// }
// 201 -> { code: 'DV-0043'; token: string; paymentUrl: string | null }  // null = gratuito, já confirmado
// 409 -> { message: string; reason: 'not_available' | 'sold_out' | 'too_many'; spotsLeft?: number; max?: number }
//        not_available = evento não publicado, sem venda ligada ou já começou

// GET /checkout/orders/:token  (público, 404 se não existe)
interface PublicSiteOrder {
  code: string;
  kind: 'products' | 'tickets';
  status: 'pending_payment' | 'paid' | 'expired' | 'cancelled' | 'refunded';
  fulfillmentStatus: 'awaiting' | 'preparing' | 'ready' | 'completed';   // só faz sentido em products
  items: { name: string; slug: string | null; unitPrice: number; quantity: number; imageUrl: string | null; leadTimeDays: number | null }[];  // [] em tickets
  event: { title: string; slug: string; startsAt: string; endsAt: string; locationName: string | null; locationAddress: string | null } | null;  // só em tickets
  tickets: { attendeeName: string; unitPrice: number }[];   // [] em products
  subtotal: number; deliveryFee: number; total: number;
  deliveryMethod: 'pickup' | 'delivery' | null;   // null em tickets
  bairro: string | null;          // sem rua/número: a página é pública pra quem tem o link
  pickup: { address: string; hours: string; instructions: string | null } | null;   // só em retirada
  paymentUrl: string | null;      // só enquanto pending_payment e não vencido
  expiresAt: string;
  createdAt: string;
}

// ProductPublic (já existente) ganha, na Tarefa 4:
//   availability: 'in_stock' | 'made_to_order' | 'sold_out';
//   leadTimeDays: number | null;     // só em made_to_order
// ProductAdmin ganha stock: number | null, leadTimeDays: number | null.

// SiteEvent (contrato público da agenda) ganha, na Tarefa 11:
//   ticketSales: boolean;          // venda/inscrição pelo site ligada
//   maxTicketsPerOrder: number;
//   spotsLeft: number | null;      // null = sem limite (spots null) ou venda desligada
//   soldOut: boolean;              // ticketSales && spotsLeft === 0

// Admin (ClerkAuthGuard)
// GET   /site-orders?status=&kind=&eventId=&q=&page=&perPage=   -> Paginated<SiteOrderAdmin>   (q = código ou nome do comprador)
// GET   /site-orders/:id                         -> SiteOrderAdmin (com endereço completo, telefone, e-mail, ids do Pagar.me)
// PATCH /site-orders/:id/fulfillment  { fulfillmentStatus }
// POST  /site-orders/:id/cancel
// POST  /site-orders/:id/sync                    -> SiteOrderAdmin (re-checa no Pagar.me)
// GET   /delivery-areas                          -> { zone: string; areas: DeliveryAreaAdmin[]; unassigned: { id; regionName }[] }[]   (conjunto pequeno e fixo: sem paginação)
// POST  /delivery-areas  { zone, name, fee }
// PATCH /delivery-areas/:id  { name?, fee? }
// DELETE /delivery-areas/:id                     (os bairros ficam sem área = sem entrega)
// PUT   /delivery-areas/:id/locations  { locationIds: string[] }   (substitui a lista; bairro de outra zona -> 400)
//   DeliveryAreaAdmin = { id; zone; name; fee: number; locations: { id; regionName; covered }[] }
// GET   /store-settings                          -> StoreSettings
// PATCH /store-settings  { pickupEnabled?, pickupAddress?, pickupHours?, pickupInstructions?, maxInstallments?, minInstallmentValue? }
// GET   /store-settings/public  (público)        -> { maxInstallments: number; minInstallmentValue: number }   // "ou em até 3x de R$ 30,00 sem juros" na página do produto
// GET   /events/:id/attendees?q=&page=&perPage=  -> Paginated<{ id; attendeeName; checkedInAt: string | null; order: { id; code; customerName; customerPhone } }> & { sold: number; spots: number | null }
// PATCH /site-order-tickets/:id/check-in  { checkedIn: boolean }
// EventAdmin ganha ticketSales, maxTicketsPerOrder, sold (pagos) e reserved (pendentes válidos)

// Webhook (sem Clerk; autenticação configurada no painel do Pagar.me)
// POST /webhooks/pagarme   eventos: charge.paid, charge.payment_failed, charge.refunded, chargeback.received (substitui charge.chargedback, descontinuado em 30/09/2026), checkout.canceled
```

## Global Constraints

- **Lista que cresce é paginada desde o começo** (`src/common/pagination.ts`) e aceita busca/filtro no servidor — `GET /site-orders` e `GET /events/:id/attendees` já estão assim. Áreas de entrega são um conjunto pequeno e fixo (dezenas), por isso voltam sem paginação — dizer isso no service. Ver `CLAUDE.md` → Pagination.
- **Toda tabela nova ganha seed** em `prisma/seed.ts` na mesma tarefa que a cria (`CLAUDE.md` → Scripts).
- **Produção tem dado real.** Schema novo vai pra Neon só como delta (`prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma --script`), revisado (só `CREATE TABLE`/`CREATE TYPE`/`ADD COLUMN`/`CREATE INDEX`/`ADD CONSTRAINT`; qualquer `DROP`/`TRUNCATE` = parar), aplicado com `prisma db execute`, depois `prisma migrate resolve --applied <pasta_nova>`. A migration local continua squashed num único `*_init`. Entregar o SQL num `NEON-*.md` na raiz, fora do git (`.git/info/exclude`), como foi com o catálogo.
- **Dinheiro é `Decimal(10,2)` no banco** e número só na borda (DTO de saída). Somas feitas com `Prisma.Decimal`, nunca com `number`. Pro Pagar.me, **centavos inteiros** convertidos num helper só (`toCents(Decimal): number`, com teste de `19.90 → 1990` e `0.1 + 0.2`).
- **Nada do Pagar.me fora de `src/pagarme/`.** Os outros módulos dependem da interface `PaymentGateway` (Tarefa 6), o que deixa os testes sem rede e a V2 trocando só esse módulo.
- **Webhook responde 2xx sempre que a autenticação é válida**, mesmo que o pedido não seja nosso ou já tenha sido processado — senão o Pagar.me reenvia. Autenticação inválida → 401. Erro ao consultar o Pagar.me → 500 (aí é bom que ele reenvie).
- **Rotas públicas novas validam limites**: no máximo 30 itens distintos, quantidade 1–20 por item, `notes` ≤ 500 chars, e-mail/telefone válidos (`@IsEmail`, telefone normalizado com `src/common/format-phone.ts`).
- Depois de mexer em DTO/controller: `npm run openapi:metadata` (o CI falha se `src/metadata.ts` ficar velho). Webhook usa `@ApiExcludeController`.
- Variáveis novas (Vercel + `.env.example` com valor fake): `PAGARME_SECRET_KEY` (`sk_test_…` em dev/homologação, `sk_live_…` em produção), `PAGARME_API_URL` (padrão produção; sandbox em dev), `PAGARME_WEBHOOK_USER`/`PAGARME_WEBHOOK_PASSWORD` (Basic Auth configurado no webhook do painel), `SITE_URL` (ex.: `https://www.daverdinha.com.br`, base do `success_url`). Em desenvolvimento, conta sandbox do Pagar.me e um túnel (ex.: `cloudflared`) pro webhook chegar no localhost.

## Review Focus

- **Preço nunca vem do cliente**: `POST /checkout` com `unitPrice` no corpo é ignorado (ValidationPipe `whitelist`); total do pedido = soma do banco + frete do banco.
- **Webhook idempotente**: o mesmo aviso chegando 3 vezes produz 1 push, 1 baixa de estoque e 1 `paidAt`. A transição pra `paid` é um `updateMany({ where: { id, status: { not: 'paid' } } })` e só quem conseguiu atualizar (count = 1) dispara efeitos.
- **Webhook não confia no corpo**: o status vem sempre de `GET /charges/:id` no Pagar.me; Basic Auth comparado em tempo constante (`timingSafeEqual`).
- **Pedido certo, valor certo**: cobrança cujo pedido não tem um `code` `DV-…` nosso (nem bate com `gatewayOrderId`/`gatewayLinkId`) é ignorada (200), e valor pago (centavos) diferente do `total` do pedido não vira `paid` — fica pendente e loga erro.
- **Estoque sem corrida**: dois `POST /checkout` simultâneos pela última unidade → um 201, um 409.
- **Sob encomenda nunca esgota e sempre tem prazo**: produto com `stock: null` e sem `leadTimeDays` não salva (400).
- **Frete nunca é zero por engano**: bairro coberto sem área → `no_area`, não frete 0.
- **Pedido vencido**: depois de `expiresAt`, a página pública mostra `expired`, sem `paymentUrl`, e a reserva some do cálculo de estoque sem ninguém rodar nada.
- **Página pública não vaza dados**: `PublicSiteOrder` não tem rua, número, telefone nem e-mail.
- **Vaga sem corrida**: dois `POST /checkout/tickets` simultâneos pela última vaga → um 201, um 409 `sold_out` (lock na linha do evento, como o estoque).
- **Preço do ingresso vem do banco**: `Event.price` no momento da compra, congelado em `SiteOrderTicket.unitPrice`.
- **Gratuito não passa pelo gateway** e evento pago nunca vira pedido de total 0 (preço `null` ou `0` = gratuito).
- **Venda fechada**: evento não publicado, com `ticketSales: false` ou depois de `startsAt` → 409, mesmo com o `eventId` certo.

---

## Task 1: Schema — pedidos, áreas de entrega, configurações da loja, estoque

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`
- Recreate: `prisma/migrations/<timestamp>_init/` (squash, como manda o README)
- Create (fora do git): `NEON-loja-v1.md`

**Interfaces:**
- Produces: os models abaixo, usados por todas as tarefas seguintes.

- [ ] **Step 1: Models**

```prisma
enum SiteOrderStatus {
  pending_payment
  paid
  expired
  cancelled
  refunded
}

enum FulfillmentStatus {
  awaiting
  preparing
  ready
  completed
}

enum DeliveryMethod {
  pickup
  delivery
}

/// Já nasce com os dois tipos, mesmo que os ingressos venham depois (Tarefas
/// 11–13): assim o delta dos ingressos só cria tabela/coluna, sem `ALTER ... DROP NOT NULL`.
enum SiteOrderKind {
  products
  tickets
}

/// Pedido feito no site (carrinho ou ingresso + Pagar.me). Não confundir com
/// `Order`, que é o pedido de catálogo recebido pelo WhatsApp.
model SiteOrder {
  id                String            @id @default(uuid())
  /// Vira o código `DV-0001` mostrado pra cliente e pro comprador.
  number            Int               @unique @default(autoincrement())
  /// Vai na URL pública do pedido; o número é sequencial e não pode ser.
  publicToken       String            @unique @default(uuid()) @map("public_token")
  kind              SiteOrderKind     @default(products)
  status            SiteOrderStatus   @default(pending_payment)
  fulfillmentStatus FulfillmentStatus @default(awaiting) @map("fulfillment_status")
  customerName      String            @map("customer_name")
  customerEmail     String            @map("customer_email")
  customerPhone     String            @map("customer_phone")
  /// `null` em pedido de ingresso (não tem entrega).
  deliveryMethod    DeliveryMethod?   @map("delivery_method")
  cep               String?
  street            String?
  streetNumber      String?           @map("street_number")
  complement        String?
  bairro            String?
  /// Snapshot do nome da zona e da área no momento do pedido.
  deliveryZone      String?           @map("delivery_zone")
  deliveryArea      String?           @map("delivery_area")
  notes             String?
  subtotal          Decimal           @db.Decimal(10, 2)
  deliveryFee       Decimal           @map("delivery_fee") @db.Decimal(10, 2)
  total             Decimal           @db.Decimal(10, 2)
  /// Link de pagamento (`pl_…`), pedido (`or_…`) e cobrança (`ch_…`) no Pagar.me. Nomes neutros de propósito.
  gatewayLinkId     String?           @unique @map("gateway_link_id")
  gatewayOrderId    String?           @unique @map("gateway_order_id")
  gatewayChargeId   String?           @map("gateway_charge_id")
  gatewayStatus     String?           @map("gateway_status")
  paymentUrl        String?           @map("payment_url")
  paidAt            DateTime?         @map("paid_at")
  expiresAt         DateTime          @map("expires_at")
  lastSyncedAt      DateTime?         @map("last_synced_at")
  items             SiteOrderItem[]
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  @@index([kind, status, createdAt])
  @@map("site_orders")
}

model SiteOrderItem {
  id           String    @id @default(uuid())
  orderId      String    @map("order_id")
  order        SiteOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  /// SetNull: o produto pode ser excluído depois; o pedido guarda a foto do momento.
  productId    String?   @map("product_id")
  product      Product?  @relation(fields: [productId], references: [id], onDelete: SetNull)
  productName  String    @map("product_name")
  productSlug  String?   @map("product_slug")
  imageUrl     String?   @map("image_url")
  unitPrice    Decimal   @map("unit_price") @db.Decimal(10, 2)
  quantity     Int
  /// Snapshot: `null` = pronta entrega; número = sob encomenda com esse prazo.
  leadTimeDays Int?      @map("lead_time_days")

  @@index([productId])
  @@map("site_order_items")
}

/// Subdivisão de uma zona com valor de entrega próprio. Bairro coberto sem
/// área = entrega indisponível no site, nunca frete grátis.
model DeliveryArea {
  id        String             @id @default(uuid())
  zone      String
  name      String
  fee       Decimal            @db.Decimal(10, 2)
  locations DeliveryLocation[]
  createdAt DateTime           @default(now()) @map("created_at")
  updatedAt DateTime           @updatedAt @map("updated_at")

  @@unique([zone, name])
  @@map("delivery_areas")
}

/// Linha única (id = 1), como `BotSettings`.
model StoreSettings {
  id                 Int      @id @default(1)
  pickupEnabled      Boolean  @default(true) @map("pickup_enabled")
  pickupAddress      String   @map("pickup_address")
  pickupHours        String   @map("pickup_hours")
  pickupInstructions String?  @map("pickup_instructions")
  /// Parcelamento sem juros pro comprador (decisão 19).
  maxInstallments    Int      @default(3) @map("max_installments")
  minInstallmentValue Decimal @default(30) @map("min_installment_value") @db.Decimal(10, 2)
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@map("store_settings")
}
```

Em `Product`: `stock Int?` (comentário: "`null` = sob encomenda") , `leadTimeDays Int? @map("lead_time_days")` (comentário: "prazo de confecção em dias; obrigatório quando `stock` é `null`") e `orderItems SiteOrderItem[]`.

Em `DeliveryLocation`: `areaId String? @map("area_id")` e `area DeliveryArea? @relation(fields: [areaId], references: [id], onDelete: SetNull)`, `@@index([areaId])`.

- [ ] **Step 2: Squash e aplicar local** — apagar a pasta `*_init` atual, `npx prisma migrate dev --name init`, `npx prisma db seed`, `npm test` (nada deve quebrar: só models e colunas novas).
- [ ] **Step 3: Seed das tabelas novas** em `prisma/seed.ts`, no mesmo molde de `seedCatalog()` (`upsert` por chave natural, `update: {}`, roda duas vezes sem duplicar):
  - `StoreSettings` id 1 (parcelamento no padrão 3x / R$ 30) com o endereço do ateliê (`R. Capiberibe, 32 - Santo Cristo, Rio de Janeiro - RJ, 20220-030`, o mesmo de `daverdinha/src/data/business.ts`) e um horário de exemplo;
  - duas áreas por zona de `DeliveryLocation` (ex.: "Perto" R$ 15, "Longe" R$ 30), com os bairros da zona divididos entre elas; um bairro coberto fica sem área, pra testar `no_area`. A atribuição só preenche `areaId` onde está `null`;
  - no catálogo de exemplo: um produto com `stock: 1`, um com `stock: 0` (esgotado), os outros sob encomenda com `leadTimeDays` entre 5 e 15;
  - três pedidos de exemplo por `customerEmail` `*@exemplo.com` — um `paid` com entrega, um `paid` com retirada em preparo, um `pending_payment` já vencido.
  Nada disso deve mudar as contagens do e2e (`test/prisma-schema.e2e-spec.ts`); se mudar, ajustar o número lá.
- [ ] **Step 4: Delta de produção** — gerar com `prisma migrate diff` contra a Neon, conferir que só há `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` (`products.stock`, `products.lead_time_days`, `delivery_locations.area_id`), `CREATE INDEX`, `ADD CONSTRAINT`; acrescentar o `INSERT` da linha de `store_settings` com o endereço do ateliê; salvar em `NEON-loja-v1.md` com os passos (`db execute`, `migrate resolve --applied <pasta>`, `migrate status`). **Não aplicar** — o usuário aplica. Os produtos que já existem ficam com `stock` e `leadTimeDays` `null`: aparecem como sob encomenda sem prazo até a cliente editar (o site mostra "Sob encomenda · prazo combinado no WhatsApp" nesse caso).
- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts
git commit -m "feat(site-orders): add site order, delivery area, store settings and stock schema"
```

---

## Task 2: `resolveCep` compartilhado + `GET /delivery-locations/check`

Movida do plano da agenda (`2026-11-04-agenda-eventos.md`, Tarefa 6), **sem mudança de conteúdo** — seguir os passos de lá. O frete (Tarefa 5) chama `DeliveryLocationsService.resolveCep`, então ela vem antes.

Acréscimo: o retorno `covered` passa a trazer o que o frete precisa:

```ts
type CepResolution =
  | { status: 'covered'; bairro: string; zone: string; locationId: string }
  | { status: 'not_covered'; bairro: string }
  | { status: 'unresolved' };
```

O endpoint público continua devolvendo só `{ status, bairro? }` (o site não precisa do resto) — o controller tira os outros campos antes de responder.

- [ ] Passos 1–6 da Tarefa 6 do plano da agenda, com o tipo acima.
- [ ] Commit: `feat(delivery-locations): share CEP resolution between bot and site`

---

## Task 3: Áreas de entrega e retirada

**Files:**
- Create: `src/delivery-locations/delivery-areas.service.ts` (+ `.spec.ts`), `delivery-areas.controller.ts` (+ `.spec.ts`), `dto/create-delivery-area.dto.ts`, `dto/update-delivery-area.dto.ts`, `dto/set-area-locations.dto.ts`
- Modify: `src/delivery-locations/delivery-locations.module.ts` (exporta o service)
- Create: `src/store-settings/store-settings.service.ts` (+ `.spec.ts`), `store-settings.controller.ts` (+ `.spec.ts`), `dto/update-store-settings.dto.ts`, `store-settings.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces:
  - `DeliveryAreasService.listByZone()`, `create`, `update`, `remove`, `setLocations(areaId, locationIds)`, e `feeForLocation(locationId): Promise<{ area: string; fee: Prisma.Decimal } | null>`.
  - `StoreSettingsService.get(): Promise<StoreSettings>` (lê a linha 1; se não existir, cria com os valores padrão do ateliê — produção sem seed não quebra) e `update(dto)`.

- [ ] **Step 1: Testes das áreas** — `listByZone` traz cada zona de `DeliveryLocation` com suas áreas (ordem alfabética) e os bairros cobertos sem área em `unassigned`; `create` com nome repetido na zona → 409; zona que não existe em `DeliveryLocation` → 404; `fee` negativo → 400; `setLocations` substitui a lista inteira, tira os bairros que saíram (`areaId = null`) e recusa bairro de outra zona (400); `remove` deixa os bairros sem área; `feeForLocation` de bairro sem área → `null`.
- [ ] **Step 2: Testes da loja** — `get` cria a linha padrão na primeira leitura e não duplica; `update` parcial; endereço e horário não podem ficar vazios (400) — pra tirar a retirada, desliga `pickupEnabled`; `maxInstallments` fora de 1–12 → 400; `minInstallmentValue` negativo → 400; `installmentsFor(total)` (função pura em `src/store-settings/installments.ts`, + `.spec.ts`): R$ 100 com 3x/R$ 30 → 3; R$ 59,90 → 1; R$ 60 → 2; nunca menos de 1 nem mais que o máximo; o público `GET /store-settings/public` (controller separado, sem guard) só devolve os dois campos de parcelamento.
- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar** — controllers `@Controller('delivery-areas')` e `@Controller('store-settings')` com `ClerkAuthGuard`; DTO de valor `@IsNumber({ maxDecimalPlaces: 2 }) @Min(0)`; `setLocations` numa transação.
- [ ] **Step 5: Rodar e confirmar que passa; `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(delivery-locations): add delivery areas with fees and store pickup settings`

---

## Task 4: Estoque e sob encomenda

Confirmado pela cliente (decisão 6). O admin (plano irmão, Tarefa 11) mostra um checkbox "Sob encomenda" que desabilita a quantidade e abre o campo de prazo; aqui é só o que chega no banco: `stock` número **ou** `stock: null` + `leadTimeDays`.

**Files:**
- Create: `src/site-orders/stock.ts` (+ `.spec.ts`)
- Modify: `src/products/dto/create-product.dto.ts` (`stock`, `leadTimeDays`), `src/products/products.service.ts` (+ `.spec.ts`) (`ProductAdmin`, `ProductPublic.availability`/`leadTimeDays`)
- Modify: `test/products.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `availableStock(tx, productIds: string[], now: Date): Promise<Map<string, number | null>>` — `null` = sob encomenda. Disponível = `stock` − soma das quantidades em `SiteOrderItem` de pedidos `pending_payment` com `expiresAt > now`.
  - `lockProducts(tx, productIds)` — `SELECT id FROM products WHERE id = ANY($1) FOR UPDATE` via `tx.$queryRaw`, chamado no começo da transação de criação do pedido (Tarefa 7) pra serializar checkouts concorrentes do mesmo produto.
  - `availabilityOf(stockLeft: number | null): 'in_stock' | 'made_to_order' | 'sold_out'`.

- [ ] **Step 1: Testes de `availableStock`** — sob encomenda → `null`; estoque 3 com pendente de 1 válido → 2; pendente vencido não conta; pedido `paid` não conta (já baixou do `stock`); `cancelled`/`expired` não contam.
- [ ] **Step 2: Testes do service de produtos** — criar sob encomenda sem `leadTimeDays` → 400 "Informe o prazo de confecção."; `leadTimeDays` de 1 a 180; `PATCH` que só muda `stock` pra `null` valida contra o `leadTimeDays` salvo; com `stock` número, `leadTimeDays` fica guardado mas não aparece no público.
- [ ] **Step 3: DTO** — `stock` e `leadTimeDays` opcionais, inteiros ≥ 0 / 1–180, multipart (`@Type(() => Number)`), string vazia = `null` (`@Transform`).
- [ ] **Step 4: Público** — `listActive`/`findActiveBySlug` devolvem `availability` e `leadTimeDays` calculados com `availableStock` numa consulta agrupada (sem N+1); produto esgotado **continua listado** (a cliente decide desativar).
- [ ] **Step 5: e2e** — `stock: 0` → `sold_out`; `stock: 2` → `in_stock`; `stock: null, leadTimeDays: 10` → `made_to_order` com `leadTimeDays: 10`.
- [ ] **Step 6: `npm test`, `npm run test:e2e`, `npm run openapi:metadata`.**
- [ ] **Step 7: Commit** — `feat(products): add stock with reservations and made-to-order lead time`

---

## Task 5: Cotação — `POST /checkout/quote`

**Files:**
- Create: `src/site-orders/pricing.ts` (+ `.spec.ts`) — funções puras, incluindo `toCents`
- Create: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — começa só com `quote`
- Create: `src/checkout/dto/cart-item.dto.ts`, `src/checkout/dto/quote.dto.ts`
- Create: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`), `src/checkout/checkout.module.ts`, `src/site-orders/site-orders.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `DeliveryLocationsService.resolveCep` (Tarefa 2), `DeliveryAreasService.feeForLocation` e `StoreSettingsService.get` (Tarefa 3), `availableStock` (Tarefa 4).
- Produces: `CheckoutQuote` (contrato acima); `pricing.ts` exporta `lineTotal(unitPrice: Decimal, qty)`, `orderTotals(lines, deliveryFee): { subtotal, total }` em `Decimal` e `toCents(Decimal): number`.

- [ ] **Step 1: Testes de `pricing.ts`** — `19.90 × 3 = 59.70` exato; subtotal + frete; `toCents(19.90) === 1990`; tudo em `Decimal`.
- [ ] **Step 2: Testes de `quote`**:
  - item repetido no corpo (`[{p1,1},{p1,2}]`) é somado (`p1 × 3`);
  - produto inexistente/inativo vira `problems`, não exceção, e fica fora do subtotal;
  - quantidade acima do disponível → `insufficient_stock` com `available` (esgotado = `available: 0`);
  - sob encomenda nunca dá `insufficient_stock` e volta com `availability: 'made_to_order'` e o prazo;
  - sem `cep` → `delivery.available: false, reason: 'no_cep'`;
  - CEP `unresolved` / `not_covered` / bairro sem área → motivo respectivo;
  - CEP coberto com área → `{ available: true, fee, bairro, area }`;
  - `pickup` vem de `StoreSettings`; desligada → `{ available: false }`.
- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar** — DTO com `@ValidateNested({ each: true })`, `@ArrayMinSize(1)`, `@ArrayMaxSize(30)`, `quantity` `@IsInt() @Min(1) @Max(20)`. Controller `@Controller('checkout')` **sem** guard, `@Post('quote') @HttpCode(200)`.
- [ ] **Step 5: Rodar e confirmar que passa; `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(checkout): add cart quote with delivery fee`

---

## Task 6: `PagarmeModule` — gateway

**Files:**
- Create: `src/pagarme/payment-gateway.ts` (interface + token de injeção)
- Create: `src/pagarme/pagarme.service.ts` (+ `.spec.ts`)
- Create: `src/pagarme/webhook-auth.ts` (+ `.spec.ts`)
- Create: `src/pagarme/pagarme.module.ts`
- Modify: `.env.example`

- [ ] **Step 0: Conferir no sandbox** (conta de teste do Pagar.me, chave `sk_test_`) o que a documentação não responde (ver "Referência do Pagar.me") e anotar as respostas neste plano antes de escrever código:
  1. **autenticação do webhook**: o painel oferece Basic Auth (usuário/senha) ou o Pagar.me assina o corpo (cabeçalho e algoritmo)?
  2. **do link ao pedido**: criar um link com `order_code: 'DV-TESTE'`, pagar com o cartão de teste e ver no `data` do `charge.paid` se vêm `order.id` e `order.code = 'DV-TESTE'`;
  3. **reconciliação sem webhook**: o que `GET /paymentlinks/:id` devolve de verdade depois de pago, e se existe `GET /orders/:id` / `GET /orders?code=` (a doc só lista `GET /charges/:id`);
  4. se o checkout pede CPF ao comprador quando não mandamos `document` (Pix e antifraude);
  5. se o Pagar.me manda e-mail de comprovante ao comprador (decisão 9);
  5b. com a conta da cliente (quando ela trouxer os dados): taxas e prazo de recebimento contratados, parcelamento permitido na conta e se ela prefere juros pro comprador (vira só `free_installments`/`interest_rate` no `installments_setup`) — anotar aqui e ajustar os padrões da decisão 19 se for o caso.
- Produces:

```ts
export interface CheckoutInput {
  orderId: string;            // vai em customer.code
  code: string;               // DV-0001, vai em `order_code` e no `name`
  items: { id: string; description: string; quantity: number; unitPrice: Prisma.Decimal }[];
  deliveryFee: Prisma.Decimal; // vai em cart_settings.shipping_cost
  customer: { name: string; email: string; phone: string };
  successUrl: string;         // `${SITE_URL}/pedido/<token>`
  maxInstallments: number;    // de installmentsFor(total); 1 = só à vista
  expiresAt: Date;
}

export interface GatewayCharge {
  id: string;                 // ch_…
  orderId: string | null;     // or_…
  orderCode: string | null;   // DV-0001 (order_code do link)
  status: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded' | 'chargedback';  // normalizado
  amountCents: number;        // valor pago
  paidAt: string | null;
}

export interface PaymentGateway {
  createCheckout(input: CheckoutInput): Promise<{ gatewayLinkId: string; paymentUrl: string }>;
  getCharge(chargeId: string): Promise<GatewayCharge>;
  /// Reconciliação sem webhook. Implementação depende do Step 0, item 3.
  findChargesForLink(gatewayLinkId: string, orderCode: string): Promise<GatewayCharge[]>;
}
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

// webhook-auth.ts
export function isValidWebhookAuth(authorizationHeader: string | undefined, user: string, password: string): boolean;
```

- [ ] **Step 1: Testes de `webhook-auth.ts`** (puros): Basic Auth certo → `true`; senha errada, cabeçalho ausente ou malformado → `false`; usuário/senha não configurados → sempre `false` (nunca aceitar por omissão). Se o Step 0 mostrar que o Pagar.me assina o corpo, trocar por verificação de assinatura com `timingSafeEqual`, mantendo a mesma função como fronteira.
- [ ] **Step 2: Testes do service** com `fetch` mockado: `createCheckout` chama `POST {PAGARME_API_URL}/paymentlinks` com Basic Auth da chave secreta (senha vazia) e `User-Agent`; corpo com `type: 'order'`, `name`, `order_code`, `expires_in` em minutos até `expiresAt`, `max_paid_sessions: 1`, `accepted_payment_methods: ['credit_card', 'pix']`, `statement_descriptor`, `pix_settings.expires_in` em segundos, `installments_setup` com `max_installments`, `amount` = total em centavos e `free_installments = max_installments`, itens em centavos, `shipping_cost` só quando `deliveryFee > 0`, `customer_settings.customer`, `flow_settings.success_url`; devolve `id` e `url`. `getCharge` chama `GET /charges/:id` e normaliza o status (`paid`, `failed`, `canceled`, `refunded`, `chargedback`…); resposta 4xx/5xx vira exceção com a mensagem do Pagar.me no log, nunca a chave.
- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar.** Sem `PAGARME_SECRET_KEY` o módulo sobe (como `PushNotificationsService` sem VAPID), mas `createCheckout` lança `ServiceUnavailableException` — a API inteira não pode cair por falta da credencial da loja.
- [ ] **Step 5: Rodar e confirmar que passa.**
- [ ] **Step 6: Commit** — `feat(pagarme): add payment link checkout gateway and webhook auth`

---

## Task 7: Criar pedido — `POST /checkout`

**Files:**
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `create`
- Create: `src/checkout/dto/create-checkout.dto.ts`, `src/checkout/dto/customer.dto.ts` (reaproveitado pelos ingressos)
- Modify: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`)
- Create: `src/site-orders/order-code.ts` (`formatOrderCode(42) === 'DV-0042'`, + `.spec.ts`)

**Interfaces:**
- Consumes: `quote` (Tarefa 5), `lockProducts`/`availableStock` (Tarefa 4), `PaymentGateway.createCheckout` (Tarefa 6).
- Produces: `SiteOrdersService.create(dto): Promise<{ code; token; paymentUrl }>`.

Ordem dentro do `create`, numa transação interativa:

1. `lockProducts` nos produtos do carrinho;
2. recalcular a cotação dentro da transação; `problems` não vazio → `ConflictException({ message, problems })` (409);
3. `delivery` sem entrega disponível → `UnprocessableEntityException({ message, reason })` (422); `pickup` com retirada desligada → 422 `pickup_disabled`;
4. criar `SiteOrder` + itens (snapshot de nome, slug, primeira foto, preço, `leadTimeDays`; zona e área da entrega), `expiresAt = now + 60 min`;

Depois da transação (chamada externa não fica dentro do lock):

5. `createCheckout` com `maxInstallments = installmentsFor(total)`; gravar `gatewayLinkId` e `paymentUrl`;
6. se o Pagar.me falhar: marcar o pedido `cancelled` (libera a reserva na hora) e responder 503 "Não foi possível iniciar o pagamento. Tente de novo em instantes."

- [ ] **Step 1: Testes do service** — caminho feliz (snapshot correto, total = subtotal + frete do banco, `expiresAt` +60 min, checkout chamado com o `id` e o código do pedido); 409 com `problems`; 422 sem entrega; 422 com retirada desligada; `pickup` ignora endereço e grava frete 0; falha do Pagar.me cancela o pedido e devolve 503; telefone salvo normalizado.
- [ ] **Step 2: DTO** — `customer.name` 2–100, `@IsEmail()`, telefone com 10–13 dígitos depois de limpar; `address` obrigatório só com `delivery` (`@ValidateIf`), `cep` 8 dígitos depois de limpar.
- [ ] **Step 3: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa.**
- [ ] **Step 4: e2e de concorrência** (`test/checkout.e2e-spec.ts`, gateway trocado por fake com `overrideProvider(PAYMENT_GATEWAY)`): produto `stock: 1`, dois `POST /checkout` em `Promise.all` → um 201, um 409.
- [ ] **Step 5: `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(checkout): create site orders with Pagar.me checkout`

---

## Task 8: Webhook e máquina de status

**Files:**
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `applyGatewayCharge`
- Create: `src/checkout/pagarme-webhook.controller.ts` (+ `.spec.ts`)
- Modify: `src/push-notifications/push-notifications.service.ts` (+ `.spec.ts`) — `notifyNewOrder`
- Modify: `src/checkout/checkout.module.ts` (importa `PushNotificationsModule`)

**Interfaces:**
- Produces:
  - `SiteOrdersService.applyGatewayCharge(charge: GatewayCharge): Promise<void>`
  - `PushNotificationsService.notifyNewOrder({ id, code, total, customerName, kind, summary }): Promise<void>` — título "Novo pedido DV-0042", corpo "Maria · R$ 159,80", `url: /admin/pedidos/<id>`.

Regras do `applyGatewayCharge` (acha o `SiteOrder` por `gatewayOrderId` ou pelo número do `orderCode` `DV-…`; na primeira vez grava `gatewayOrderId`):

| `charge.status` | Efeito no pedido |
|---|---|
| `paid` | se `amountCents` ≠ `toCents(total)` → só loga erro e grava `gatewayStatus`; senão `status = paid`, `paidAt`, `gatewayChargeId`; **se essa transição de fato aconteceu** (`updateMany` com `status: { not: 'paid' }` retornou 1): baixa `stock` dos itens (`decrement`, só onde `stock` não é `null`) e `notifyNewOrder` |
| `pending` | só grava `gatewayOrderId`/`gatewayStatus` |
| `failed`, `canceled` | só grava `gatewayStatus` (o cliente pode tentar de novo até vencer) |
| `refunded`, `chargedback` | `status = refunded`; se estava `paid`, devolve o estoque |

Pedido `expired`/`cancelled` que recebe `paid` (Pix gerado antes de vencer e pago no limite): vira `paid` mesmo assim — o dinheiro entrou — e o push leva "⚠️ pago depois de vencer, confira o estoque" (ou "confira as vagas", em ingresso).

Pedido de ingresso (`kind: 'tickets'`, Tarefa 12) passa pela mesma tabela; a diferença é que não há estoque pra baixar nem devolver — a vaga é contada a partir do status (decisão 15). Escrever já com o `if (order.kind === 'products')` em volta do estoque, pra a Tarefa 12 não precisar mexer aqui.

Controller:

```ts
@ApiExcludeController()
@Controller('webhooks/pagarme')
export class PagarmeWebhookController {
  @Post()
  @HttpCode(200)
  async handle(@Body() body: PagarmeWebhookBody, @Headers('authorization') auth?: string) {
    if (!isValidWebhookAuth(auth, process.env.PAGARME_WEBHOOK_USER ?? '', process.env.PAGARME_WEBHOOK_PASSWORD ?? '')) {
      throw new UnauthorizedException();
    }
    const chargeId = extractChargeId(body);                   // charge.* / chargeback.* -> id da cobrança em data (formato conferido no Step 0 da Tarefa 6)
    if (!chargeId) return;                                    // checkout.canceled e outros: 200 e ignora (o vencimento já é nosso)
    const charge = await this.gateway.getCharge(chargeId);    // erro aqui = 500, Pagar.me reenvia
    await this.orders.applyGatewayCharge(charge);             // pedido desconhecido: no-op
  }
}
```

O webhook manda JSON normal e não depende do corpo cru — não precisa do `RawBodyMiddleware` do WhatsApp. Conferir em `bootstrap.ts` que a rota nova recebe o parser JSON padrão.

- [ ] **Step 1: Testes de `applyGatewayCharge`** — cada linha da tabela; **mesmo `paid` 3 vezes → 1 push e 1 decremento**; valor divergente não vira `paid`; pedido desconhecido não lança; `refunded` depois de `paid` devolve estoque.
- [ ] **Step 2: Testes do controller** — autenticação inválida → 401 e gateway não chamado; corpo sem pedido → 200 sem chamar gateway; o status usado é o de `getCharge`, não o do corpo (corpo dizendo `paid` com `getCharge` dizendo `pending` não marca pago); erro do gateway propaga (500).
- [ ] **Step 3: Teste do `notifyNewOrder`** no mesmo molde dos de `notifyNewMessage`.
- [ ] **Step 4: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa.**
- [ ] **Step 5: Commit** — `feat(checkout): process Pagar.me payment notifications`

---

## Task 9: Página pública do pedido + reconciliação + vencimento

**Files:**
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `findPublicByToken`, `syncWithGateway`, `expireIfDue`
- Modify: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`)

**Interfaces:**
- Produces: `GET /checkout/orders/:token` → `PublicSiteOrder`; `SiteOrdersService.syncWithGateway(orderId): Promise<void>` (reaproveitado pelo admin na Tarefa 10).

`findPublicByToken`:
1. acha pelo `publicToken` (404 se não existe);
2. se `pending_payment`, com `gatewayLinkId`, e `lastSyncedAt` é nulo ou tem mais de 60 s: `syncWithGateway` = `findChargesForLink` + `applyGatewayCharge` em cada uma (a mais recente por último), grava `lastSyncedAt`. Falha do Pagar.me aqui **não** derruba a página: loga e segue com o que está no banco;
3. se continua `pending_payment` e `expiresAt` já passou: `status = expired` (`updateMany` com `status: 'pending_payment'`, pra não atropelar um `paid` concorrente);
4. monta `PublicSiteOrder` — sem rua, número, telefone, e-mail; `paymentUrl` só se `pending_payment`; `pickup` com os dados atuais de `StoreSettings` em pedido de retirada; `event: null` e `tickets: []` até a Tarefa 12 preencher pros pedidos de ingresso.

- [ ] **Step 1: Testes** — token inexistente 404; pendente dentro do prazo chama o Pagar.me uma vez e não chama de novo em 60 s; Pagar.me fora do ar não lança; pendente vencido vira `expired`; resposta não tem campos de endereço/contato (`expect(Object.keys(body)).not.toContain('street')` etc.).
- [ ] **Step 2: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa.**
- [ ] **Step 3: Commit** — `feat(checkout): expose public order page with payment reconciliation`

---

## Task 10: Admin de pedidos — `/site-orders`

**Files:**
- Create: `src/site-orders/site-orders.controller.ts` (+ `.spec.ts`)
- Create: `src/site-orders/dto/list-site-orders.dto.ts`, `src/site-orders/dto/update-fulfillment.dto.ts`
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `list`, `findById`, `updateFulfillment`, `cancel`

**Interfaces:**
- Produces: `SiteOrderAdmin` (tudo do pedido + `code`, valores como número, itens) e as rotas de admin do bloco "Contratos".

- [ ] **Step 1: Testes**:
  - `list` paginado (`pageBounds`/`paginated` de `src/common/pagination.ts`), mais recente primeiro, filtros `status`, `kind`, `eventId` e `q` (código `DV-0042` ou nome do comprador, sem diferenciar maiúscula); **padrão sem filtro de status mostra só `paid`** (é o que a cliente precisa ver no dia a dia; pendentes/vencidos ficam atrás do filtro);
  - `updateFulfillment` só em pedido `paid` (senão 409);
  - `cancel`: `pending_payment` → `cancelled`; `paid` → `cancelled` + devolve estoque; já `cancelled`/`refunded` → 409;
  - `findById` de pedido pendente chama `syncWithGateway` (mesma regra de 60 s);
  - `POST :id/sync` força a sincronização ignorando os 60 s.
- [ ] **Step 2: Rodar e confirmar que falha. Implementar** (controller com `ClerkAuthGuard`; `SiteOrdersModule` registra este controller **depois** de qualquer controller público). **Rodar e confirmar que passa.**
- [ ] **Step 3: `npm run openapi:metadata`.**
- [ ] **Step 4: Commit** — `feat(site-orders): add admin order list, fulfillment and cancel`

---

## Task 11: Ingressos — schema e vagas

**Pré-requisito:** plano da agenda (`2026-11-04-agenda-eventos.md`), Tarefas 1–5, no `main` (model `Event`, `EventsService`, controllers admin e público).

**Files:**
- Modify: `prisma/schema.prisma`; recriar a migration única; `prisma/seed.ts`
- Create (fora do git): `NEON-ingressos.md`
- Create: `src/site-orders/spots.ts` (+ `.spec.ts`)
- Modify: `src/events/dto/create-event.dto.ts` (`ticketSales`, `maxTicketsPerOrder`), `src/events/events.service.ts` (+ `.spec.ts`) — `SiteEvent` e `EventAdmin` com os campos novos
- Modify: `test/events.e2e-spec.ts`

**Interfaces:**
- Produces:

```prisma
// em Event:
  /// Venda/inscrição pelo site. Desligada, o evento usa ctaUrl/WhatsApp como antes.
  ticketSales        Boolean           @default(false) @map("ticket_sales")
  /// Limite por compra, configurado pela cliente (1–50).
  maxTicketsPerOrder Int               @default(10) @map("max_tickets_per_order")
  tickets            SiteOrderTicket[]
  orders             SiteOrder[]

// em SiteOrder:
  /// Só em pedido de ingresso. Restrict: evento com venda não pode ser apagado (a API responde 409).
  eventId     String?          @map("event_id")
  event       Event?           @relation(fields: [eventId], references: [id], onDelete: Restrict)
  tickets     SiteOrderTicket[]
  @@index([eventId, status])

/// Um ingresso = um participante. Preço congelado no momento da compra.
model SiteOrderTicket {
  id           String    @id @default(uuid())
  orderId      String    @map("order_id")
  order        SiteOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  eventId      String    @map("event_id")
  event        Event     @relation(fields: [eventId], references: [id], onDelete: Restrict)
  attendeeName String    @map("attendee_name")
  unitPrice    Decimal   @map("unit_price") @db.Decimal(10, 2)
  checkedInAt  DateTime? @map("checked_in_at")

  @@index([eventId])
  @@index([orderId])
  @@map("site_order_tickets")
}
```

  - `takenSpots(tx, eventId, now): Promise<{ sold: number; reserved: number }>` — `sold` = ingressos de pedidos `paid`; `reserved` = de pedidos `pending_payment` com `expiresAt > now`.
  - `spotsLeft(event, taken): number | null` — `null` se `spots` é `null`; senão `max(0, spots − sold − reserved)`.
  - `lockEvent(tx, eventId)` — `SELECT id FROM events WHERE id = $1 FOR UPDATE`.
  - `SiteEvent` ganha `ticketSales`, `maxTicketsPerOrder`, `spotsLeft`, `soldOut` (contrato acima); `EventAdmin` ganha `ticketSales`, `maxTicketsPerOrder`, `sold`, `reserved`.

- [ ] **Step 1: Schema** acima; squash e aplicar local (`migrate dev`, `db seed`, `npm test`).
- [ ] **Step 2: Seed** — no `seedEvents()` da agenda, ligar `ticketSales` num evento futuro pago (com `spots: 12`, `maxTicketsPerOrder: 4`) e num gratuito (sem `spots`); dois pedidos de ingresso de exemplo (`*@exemplo.com`), um `paid` com 2 participantes e um `pending_payment` vencido, por `customerEmail`, sem duplicar.
- [ ] **Step 3: Testes de `spots.ts`** — sem `spots` → `null`; pagos e pendentes válidos ocupam; pendente vencido, `cancelled`, `expired`, `refunded` não ocupam; nunca negativo (lotação reduzida abaixo do vendido → 0).
- [ ] **Step 4: Testes do `EventsService`** — `upcoming`/`findBySlug` trazem `spotsLeft`/`soldOut` calculados **numa consulta agrupada** pros eventos da lista (não N+1); `ticketSales: false` → `spotsLeft: null`, `soldOut: false`; `maxTicketsPerOrder` fora de 1–50 → 400; excluir evento com ingresso vendido → 409 "Esse evento tem ingressos vendidos. Despublique em vez de excluir."; reduzir `spots` abaixo do vendido → 400 "Já há N vagas ocupadas.".
- [ ] **Step 5: DTO** — `ticketSales` com o mesmo `@Transform` de booleano multipart dos outros campos; `maxTicketsPerOrder` `@Type(() => Number) @IsInt() @Min(1) @Max(50)`.
- [ ] **Step 6: Rodar, `npm run test:e2e`, `npm run openapi:metadata`.**
- [ ] **Step 7: Delta de produção** em `NEON-ingressos.md` — esperado só `CREATE TABLE "site_order_tickets"`, `ALTER TABLE "events" ADD COLUMN` (`ticket_sales`, `max_tickets_per_order`), `ALTER TABLE "site_orders" ADD COLUMN "event_id"`, índices e FKs. **Não aplicar.**
- [ ] **Step 8: Commit** — `feat(events): add ticket sales settings and spot counting`

---

## Task 12: Comprar ingresso — `POST /checkout/tickets`

**Files:**
- Create: `src/checkout/dto/create-ticket-checkout.dto.ts`
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `createTickets`, e `findPublicByToken` preenchendo `event`/`tickets`
- Modify: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`)
- Modify: `src/push-notifications/push-notifications.service.ts` (+ `.spec.ts`) — `notifyNewOrder` com variação de ingresso

**Interfaces:**
- Consumes: `lockEvent`/`takenSpots`/`spotsLeft` (Tarefa 11), `PaymentGateway.createCheckout` (Tarefa 6), `applyGatewayCharge` (Tarefa 8, sem mudança).
- Produces: `SiteOrdersService.createTickets(dto): Promise<{ code; token; paymentUrl: string | null }>`.

Ordem dentro do `createTickets`, numa transação interativa:

1. `lockEvent`; evento não publicado, `ticketSales: false` ou `startsAt <= now` → `ConflictException({ message, reason: 'not_available' })`;
2. participantes acima de `maxTicketsPerOrder` → `ConflictException({ message: 'O máximo por compra é N ingressos.', reason: 'too_many', max })`;
3. `spotsLeft` < quantidade de participantes → `ConflictException({ message: 'Restam N vagas.', reason: 'sold_out', spotsLeft })`;
4. preço = `event.price` (`null` ou `0` = gratuito); criar `SiteOrder` (`kind: 'tickets'`, `eventId`, `deliveryMethod: null`, `deliveryFee: 0`, `subtotal = total = preço × participantes`) + um `SiteOrderTicket` por nome;
5. **gratuito:** `status: 'paid'`, `paidAt: now`, `expiresAt: now` (não reserva nada pendente) — sai da transação e chama `notifyNewOrder`; responde `paymentUrl: null`;
6. **pago:** `expiresAt = min(now + 60 min, startsAt)`.

Depois da transação, só no pago: `createCheckout` com um item "Ingresso — <título do evento>" × quantidade, sem entrega, parcelas por `installmentsFor(total)`; falha → pedido `cancelled` (libera as vagas) e 503, igual à Tarefa 7.

Push: título "Nova inscrição DV-0043" (gratuito) ou "Ingresso vendido DV-0043" (pago), corpo "Maria · 2 ingressos · Oficina de terrário".

- [ ] **Step 1: Testes do service** — pago: pedido `pending_payment`, 1 ticket por nome, preço do banco congelado, `expiresAt` limitado por `startsAt`, checkout sem item de entrega; gratuito: `paid` direto, sem gateway, push disparado uma vez; `not_available` nos três casos; `too_many` respeitando o limite do evento (não o 10 fixo); `sold_out` com `spotsLeft`; sem limite (`spots: null`) nunca dá `sold_out`; falha do Pagar.me cancela e devolve 503.
- [ ] **Step 2: DTO** — `attendees` `@ArrayMinSize(1) @ArrayMaxSize(50)` (teto técnico; o limite real é o do evento, no service), `name` 2–100 depois de `trim`; `customer` e `notes` com a classe de DTO do `POST /checkout`.
- [ ] **Step 3: `findPublicByToken`** devolve `event` (título, slug, datas, local) e `tickets` (nome e preço) em pedido de ingresso; `items: []`, `deliveryMethod: null`, `pickup: null`.
- [ ] **Step 4: e2e de concorrência** — evento com `spots: 1`, dois `POST /checkout/tickets` simultâneos → um 201, um 409 `sold_out`.
- [ ] **Step 5: Rodar e confirmar que passa; `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(checkout): sell event tickets and free sign-ups`

---

## Task 13: Admin — lista de presença e check-in

**Files:**
- Create: `src/site-orders/site-order-tickets.controller.ts` (+ `.spec.ts`), `src/site-orders/dto/list-attendees.dto.ts`, `src/site-orders/dto/check-in.dto.ts`
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `listAttendees`, `setCheckIn`
- Modify: `src/site-orders/site-orders.module.ts`

**Interfaces:**
- Produces: `GET /events/:id/attendees` e `PATCH /site-order-tickets/:id/check-in` (contrato acima), ambos com `ClerkAuthGuard`. A rota de participantes fica no módulo de pedidos (é leitura de `SiteOrderTicket`), com `@Controller()` e caminhos completos, pra não acoplar `EventsModule` a pedidos.

- [ ] **Step 1: Testes** — `listAttendees` paginado, só ingressos de pedidos `paid`, ordem alfabética por participante, `q` filtra por participante ou comprador; devolve `sold` e `spots` do evento; evento inexistente → 404; `setCheckIn(true)` grava `checkedInAt = now`, `false` volta pra `null`; ingresso de pedido não pago → 409.
- [ ] **Step 2: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa; `npm run openapi:metadata`.**
- [ ] **Step 3: Commit** — `feat(site-orders): add event attendee list with check-in`

---

## Task 14: Fechamento — e2e, docs, homologação e produção

- [ ] **Step 1: e2e** `test/checkout.e2e-spec.ts` (banco real, gateway fake): quote → create → webhook autenticado com o gateway fake devolvendo `paid` → `GET /checkout/orders/:token` mostra `paid` → `GET /site-orders` (sem token → 401). Mesmo caminho pra ingresso pago (`POST /checkout/tickets` → webhook → `paid` → aparece em `GET /events/:id/attendees`) e um gratuito (201 com `paymentUrl: null`, já `paid`). Conferir que o CI continua verde e ajustar as contagens do e2e de seed se os exemplos novos entrarem nelas.
- [ ] **Step 2: README** — seção "Loja online (módulos checkout, site-orders, pagarme, store-settings)": fluxo de produto e de ingresso, máquina de status, estoque/sob encomenda/vagas, áreas de entrega, variáveis, como testar com o sandbox do Pagar.me e túnel, e o aviso de que estorno é no painel do Pagar.me na V1. Atualizar `CLAUDE.md` (o webhook novo também tem que responder 2xx; `SiteOrder` ≠ `Order`; ingresso é `SiteOrder` com `kind: 'tickets'`; nada do Pagar.me fora de `src/pagarme/`).
- [ ] **Step 3: Homologação no sandbox do Pagar.me** (manual, documentar o resultado no PR; cartões de teste `4000000000000010` aprovado e `4000000000000028` recusado): cartão aprovado à vista e parcelado (conferir que o comprador paga o total, sem juros); pedido abaixo da parcela mínima só oferece à vista; cartão recusado e depois aprovado no mesmo pedido; Pix pendente que vence; webhook derrubado (URL errada) e a página do pedido reconciliando sozinha; produto sob encomenda com prazo no pedido; entrega numa área e bairro sem área; retirada desligada; ingresso pago até esgotar a última vaga; limite por compra do evento; inscrição gratuita; check-in no admin.
- [ ] **Step 4: Produção** (usuário executa): aplicar `NEON-loja-v1.md` e depois `NEON-ingressos.md`; cadastrar `PAGARME_SECRET_KEY` **de produção**, `PAGARME_API_URL`, `PAGARME_WEBHOOK_USER`, `PAGARME_WEBHOOK_PASSWORD`, `SITE_URL` na Vercel; configurar o webhook no painel do Pagar.me (URL `https://<api>/webhooks/pagarme`, eventos `charge.paid`, `charge.payment_failed`, `charge.refunded`, `chargeback.received`, com a autenticação definida no Step 0 da Tarefa 6); `FRONTEND_URL` já cobre o domínio do site (CORS). A cliente cadastra áreas de entrega e confere a retirada no admin antes de ligar a loja. Primeira compra real de valor baixo, estornada pelo painel.
- [ ] **Step 5: Commit** — `docs: document the online store`

---

## Depois da V1 (fora deste plano)

- **V2 — pagamento dentro do site (checkout transparente do Pagar.me):** o cartão é tokenizado no navegador com a chave pública (`pk_…`) e a API cria o pedido no Pagar.me com `credit_card` ou `pix` direto (o QR do Pix aparece no próprio site). Troca só a Tarefa 6/7 e a tela de pagamento do site; pedido, webhook, status e admin ficam iguais. Estimativa: 16–24 h.
- Estorno pela API no botão de cancelar.
- **E-mail próprio** (confirmação do pedido, "pedido pronto/saiu pra entrega", ingresso): serviço de envio transacional recomendado é o **Resend** (plano grátis de 3.000 e-mails/mês e 100/dia, SDK pra Node), num módulo `src/email/` com a mesma regra de "nada do provedor fora do módulo". Antes de enviar o primeiro, configurar o domínio `daverdinha.com.br` no DNS (SPF, DKIM e DMARC), senão cai no spam. Variáveis: `RESEND_API_KEY`, `EMAIL_FROM`. A caixa de entrada da cliente (`contato@`) é outra coisa: Google Workspace, Zoho Mail grátis ou redirecionamento da Cloudflare.
- **"Avise-me quando chegar"** (pedido da cliente em 2026-11-06; depende do e-mail próprio): produto esgotado mostra um campo de e-mail; o cadastro fica numa tabela `StockAlert { productId, email, createdAt, notifiedAt }` (rota pública `POST /products/:id/stock-alerts`, com limite por IP e um e-mail por produto). Quando o disponível de um produto passa de 0 pra mais de 0 — admin repôs o estoque ou um pedido pago foi cancelado —, a API manda o aviso pra quem está na lista e grava `notifiedAt` (cada pessoa recebe uma vez). Precisa de texto de consentimento (LGPD) e link pra sair da lista. O admin vê quantas pessoas esperam cada produto.
- Cupom de desconto, frete grátis acima de um valor, envio pelos Correios pra fora do Rio. Boleto não (decisão da cliente).
- Pedido do site aparecendo na conversa do WhatsApp do mesmo telefone.
- Ingresso: QR code por participante e check-in lendo o QR; tipos de ingresso (meia, lote); lista de espera quando esgota; limite por pessoa (por e-mail) além do limite por compra; ingresso e produto no mesmo pedido.

## Self-review (feito ao escrever este plano)

- **Cobertura do pedido do usuário:** cadastro de produto (plano irmão, Fase 1; aqui `stock` e `leadTimeDays`), exibição no front (feita), V1 com redirect pro Pagar.me (Tarefas 5–9), admin de pedidos (Tarefa 10), áreas de entrega e retirada (Tarefa 3), ingressos (Tarefas 11–13). V2 explicitamente fora.
- **Nomes conferidos contra o código:** `Order`/`OrderItem` já existem (pedido do WhatsApp) → models novos com prefixo `Site`; `DeliveryLocation.zone` é `String` livre → `DeliveryArea.zone` também; `BotSettings` é linha única com id 1 → `StoreSettings` no mesmo molde; `PushNotificationsService` só tem `notifyNewMessage` → `notifyNewOrder` é novo; `vercel.json` só tem o cron diário de mídia → nada de cron novo (decisão 11); endereço do ateliê copiado de `daverdinha/src/data/business.ts`.
- **Dependências entre tarefas:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10; depois [agenda 1–5] → 11 → 12 → 13; 14 fecha tudo. A Tarefa 6 só depende do Step 0 no sandbox e pode andar em paralelo com 2–5. A agenda pode andar em paralelo com 1–10. Produtos podem ir ao ar antes dos ingressos (Tarefa 14 em duas etapas, se for o caso).
- **Incertezas assumidas:** o que a documentação do Pagar.me não responde (autenticação do webhook, ligação link → pedido, reconciliação sem webhook, CPF) está concentrado no Step 0 da Tarefa 6 e atrás da interface `PaymentGateway`; se a resposta mudar o desenho, só `src/pagarme/` e o controller do webhook mudam.
