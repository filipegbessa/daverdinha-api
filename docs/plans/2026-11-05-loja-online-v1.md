# Loja online V1 — plano de implementação (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a cliente final compra pelo site: monta o carrinho, escolhe entrega ou retirada, paga no Mercado Pago (Checkout Pro, fora do site) e volta pra uma página do pedido. A Daverdinha vê e acompanha os pedidos no mesmo admin das conversas, recebe push de venda nova e cadastra frete por zona e (opcionalmente) estoque.

**Plano irmão:** `daverdinha/docs/plans/2026-11-05-loja-online-v1.md` (telas do admin do catálogo, carrinho, checkout, página do pedido, admin de pedidos). Os contratos de API abaixo são a fonte da verdade pros dois.

**Onde estamos:**

| Parte | Situação |
|---|---|
| Catálogo — API (`src/product-categories`, `src/products`, Blob) | ✅ feito (`docs/plans/2026-11-04-catalogo-produtos.md`) e delta aplicado na Neon. Falta só `npx prisma migrate resolve --applied 20261104204120_init` em produção. |
| Catálogo — vitrine no site | ✅ feito (prévia `/site`) |
| Catálogo — telas de cadastro no admin | ⏳ plano irmão, Fase 1 (não depende de nada aqui) |
| Checagem de CEP compartilhada (bot + site) | ⏳ Tarefa 2 deste plano (era a Tarefa 6 do plano da agenda, que foi movida pra cá porque o frete depende dela) |
| Loja V1 | ⏳ Tarefas 1 e 3–11 deste plano |
| V2 — pagamento dentro do site | fora deste plano (ver "Depois da V1") |

**Architecture:** três módulos novos seguindo o padrão do catálogo — service + controller admin com `ClerkAuthGuard` + **controller público separado**, registrado antes do admin:

- `src/mercado-pago/` — único lugar que fala com o Mercado Pago (SDK `mercadopago`): criar preferência, buscar pagamento, buscar pagamentos de um pedido, validar assinatura do webhook. Mesmo papel que `WhatsAppClientService` tem pro WhatsApp.
- `src/checkout/` — público: cotar carrinho (`POST /checkout/quote`), criar pedido (`POST /checkout`), ver pedido pelo token (`GET /checkout/orders/:token`), webhook (`POST /webhooks/mercado-pago`).
- `src/site-orders/` — regras do pedido (preço, frete, estoque, máquina de status) e o admin (`/site-orders`).

**O preço e o frete são sempre calculados no servidor.** O carrinho do site manda só `{ productId, quantity }`; nome, preço e frete vêm do banco na hora de criar o pedido e ficam congelados no pedido (snapshot). O Mercado Pago recebe os itens já com o preço do servidor.

**O webhook é a fonte da verdade do pagamento.** A volta do cliente pro site (`back_urls`) só mostra a página do pedido — não muda status. Toda mudança de status vem de `GET /v1/payments/:id` no Mercado Pago, chamado a partir do webhook ou da reconciliação (Tarefa 9), nunca do que veio na query string ou no corpo do aviso.

**Tech Stack:** NestJS 11, Prisma 5 (Postgres/Neon), SDK oficial `mercadopago` (v2: `MercadoPagoConfig`, `Preference`, `Payment`), `web-push` (já instalado), class-validator.

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Checkout Pro (redirect).** O cliente sai do site só pra pagar, em `mercadopago.com.br/checkout/v1/redirect?pref_id=…`, e volta pra `daverdinha.com.br/pedido/<token>`. Pix e cartão. **Boleto fora da V1** (`excluded_payment_types: [{ id: 'ticket' }]`): ele leva dias pra compensar e prenderia a reserva de estoque por dias. |
| 2 | **`SiteOrder`, não `Order`.** O model `Order`/`OrderItem` já existe e é o pedido de catálogo que chega pelo WhatsApp (`handleOrderMessage`). O pedido do site é outra coisa (tem endereço, frete, pagamento) e ganha models próprios: `SiteOrder`/`SiteOrderItem`, tabelas `site_orders`/`site_order_items`, rotas `/site-orders`. |
| 3 | **Código do pedido legível + token secreto.** `number` autoincremento vira `DV-0001` (o que a cliente e o cliente falam no WhatsApp). A página pública do pedido usa `publicToken` (uuid), nunca o número — senão qualquer um enumera `DV-0001`, `DV-0002`… e lê nome/endereço alheio. |
| 4 | **Frete por zona.** Usa as `DeliveryLocation` que já existem (bairro → `zone`) e uma tabela nova `DeliveryZoneFee { zone, fee }` editada no admin de entregas. CEP → bairro pela mesma função que o bot usa (Tarefa 2). Bairro não atendido, CEP não resolvido ou zona sem valor cadastrado ⇒ entrega indisponível (o site oferece retirada ou WhatsApp). **Nunca** cobrar frete zero por falta de cadastro. |
| 5 | **Retirada no ateliê** é sempre uma opção, frete 0. |
| 6 | **Estoque opcional por produto** (Tarefa 4): `Product.stock Int?`, `null` = sem controle (peça sob encomenda, item sempre disponível). Com número: pedido pendente **reserva** (conta contra o disponível até `expiresAt`), pedido pago **baixa** o estoque. Sem cron de liberação: a reserva vence sozinha porque o cálculo só soma pedidos pendentes com `expiresAt > now()`. |
| 7 | **Pedido pendente vence em 60 minutos** (`expiresAt`), e a preferência do Mercado Pago vence junto (`expires: true`, `expiration_date_to`), assim o MP não aceita pagamento depois. Pix com `date_of_expiration` alinhado. |
| 8 | **Pagamento recusado não cancela o pedido.** O cliente pode tentar de novo pelo mesmo link até `expiresAt`. Só `approved` muda pra `paid`; `refunded`/`charged_back` mudam pra `refunded`. |
| 9 | **Avisos:** push no admin quando o pedido é **pago** (não quando é criado — pedido criado e abandonado é ruído). E-mail pro cliente na V1 é o comprovante do próprio Mercado Pago; e-mail próprio fica pra depois. |
| 10 | **Cancelar pedido pago não estorna sozinho na V1.** O admin marca como cancelado (devolve o estoque) e o texto do botão avisa que o estorno é feito no painel do Mercado Pago. Estorno pela API fica pra V2. |
| 11 | **Sem cron novo.** Vercel Hobby só roda cron diário. Reconciliação (webhook perdido) acontece quando alguém lê o pedido: a página pública e o admin chamam `syncWithMercadoPago` se o pedido está pendente e não foi checado no último minuto (Tarefa 9). |

**Pra confirmar com a cliente** (os valores padrão acima valem até ela responder): valor do frete por zona; se há retirada no ateliê e o endereço/horário que aparece; se alguma peça é única (liga a Tarefa 4); se aceita boleto; conta do Mercado Pago em nome da empresa; políticas de troca/devolução (texto do site).

## Contratos

```ts
// POST /checkout/quote  (público)
// body: { items: { productId: string; quantity: number }[]; cep?: string }
interface CheckoutQuote {
  items: { productId: string; name: string; slug: string; unitPrice: number; quantity: number; lineTotal: number; imageUrl: string | null }[];
  subtotal: number;
  pickup: { fee: 0; address: string };
  delivery:
    | { available: true; fee: number; bairro: string; zone: string }
    | { available: false; reason: 'no_cep' | 'unresolved' | 'not_covered' | 'no_fee'; bairro?: string };
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
// 422 -> { message: string; reason: CheckoutQuote['delivery']['reason'] } // entrega indisponível pro CEP

// GET /checkout/orders/:token  (público, 404 se não existe)
interface PublicSiteOrder {
  code: string;
  status: 'pending_payment' | 'paid' | 'expired' | 'cancelled' | 'refunded';
  fulfillmentStatus: 'awaiting' | 'preparing' | 'ready' | 'completed';
  items: { name: string; slug: string | null; unitPrice: number; quantity: number; imageUrl: string | null }[];
  subtotal: number; deliveryFee: number; total: number;
  deliveryMethod: 'pickup' | 'delivery';
  bairro: string | null;          // sem rua/número: a página é pública pra quem tem o link
  paymentUrl: string | null;      // só enquanto pending_payment e não vencido
  expiresAt: string;
  createdAt: string;
}

// Admin (ClerkAuthGuard)
// GET   /site-orders?status=&page=&perPage=      -> Paginated<SiteOrderAdmin>
// GET   /site-orders/:id                         -> SiteOrderAdmin (com endereço completo, telefone, e-mail, ids do MP)
// PATCH /site-orders/:id/fulfillment  { fulfillmentStatus }
// POST  /site-orders/:id/cancel
// POST  /site-orders/:id/sync                    -> SiteOrderAdmin (re-checa no Mercado Pago)
// GET   /delivery-zone-fees                      -> { zone: string; fee: number | null }[]   (todas as zonas de DeliveryLocation)
// PUT   /delivery-zone-fees/:zone  { fee: number | null }

// Webhook (sem auth de Clerk; assinatura do Mercado Pago)
// POST /webhooks/mercado-pago?data.id=<paymentId>&type=payment
```

`ProductPublic` (já existente) ganha `soldOut: boolean` na Tarefa 4 — `false` sempre que `stock` é `null`.

## Global Constraints

- **Produção tem dado real.** Schema novo vai pra Neon só como delta (`prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma --script`), revisado (só `CREATE TABLE`/`CREATE TYPE`/`ADD COLUMN`/`CREATE INDEX`; qualquer `DROP`/`TRUNCATE` = parar), aplicado com `prisma db execute`, depois `prisma migrate resolve --applied <pasta_nova>`. A migration local continua squashed num único `*_init`. Entregar o SQL num `NEON-loja-v1.md` na raiz, fora do git (`.git/info/exclude`), como foi com o catálogo.
- **Dinheiro é `Decimal(10,2)` no banco** e número só na borda (DTO de saída). Somas feitas com `Prisma.Decimal`, nunca com `number` — `0.1 + 0.2` não pode virar centavo errado no total cobrado.
- **Nada do Mercado Pago fora de `src/mercado-pago/`.** Os outros módulos dependem da interface `MercadoPagoGateway` (abaixo), o que deixa os testes sem rede e a V2 trocando só esse módulo.
- **Webhook responde 2xx sempre que a assinatura é válida**, mesmo que o pagamento não seja de um pedido nosso ou já tenha sido processado — senão o Mercado Pago reenvia por dias. Assinatura inválida → 401. Erro ao consultar o MP → 500 (aí é bom que ele reenvie).
- **Rotas públicas novas validam limites**: no máximo 30 itens distintos, quantidade 1–20 por item, `notes` ≤ 500 chars, e-mail/telefone válidos (`@IsEmail`, telefone normalizado com `src/common/format-phone.ts`).
- Depois de mexer em DTO/controller: `npm run openapi:metadata` (o CI falha se `src/metadata.ts` ficar velho). Webhook usa `@ApiExcludeController`.
- Variáveis novas (Vercel + `.env.example` com valor fake): `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SITE_URL` (ex.: `https://www.daverdinha.com.br`, base das `back_urls`), `API_PUBLIC_URL` (base do `notification_url`), `STORE_PICKUP_ADDRESS`. Em desenvolvimento, credenciais **de teste** do Mercado Pago e um túnel (ex.: `cloudflared`) pro webhook chegar no localhost.

## Review Focus

- **Preço nunca vem do cliente**: `POST /checkout` com `unitPrice` no corpo é ignorado (ValidationPipe `whitelist`); total do pedido = soma do banco + frete do banco.
- **Webhook idempotente**: o mesmo aviso chegando 3 vezes produz 1 push, 1 baixa de estoque e 1 `paidAt`. A transição pra `paid` é um `updateMany({ where: { id, status: { not: 'paid' } } })` e só quem conseguiu atualizar (count = 1) dispara efeitos.
- **Assinatura do webhook**: comparação em tempo constante (`timingSafeEqual`), manifest exatamente `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
- **`external_reference` confere**: pagamento cujo `external_reference` não é um `SiteOrder.id` é ignorado (200), e pagamento com `transaction_amount` diferente do `total` do pedido não vira `paid` — fica pendente e loga erro.
- **Estoque sem corrida**: dois `POST /checkout` simultâneos pela última unidade → um 201, um 409.
- **Pedido vencido**: depois de `expiresAt`, a página pública mostra `expired`, sem `paymentUrl`, e a reserva some do cálculo de estoque sem ninguém rodar nada.
- **Página pública não vaza endereço**: `PublicSiteOrder` não tem rua, número, telefone nem e-mail.

---

## Task 1: Schema — `SiteOrder`, `SiteOrderItem`, `DeliveryZoneFee`, `Product.stock`

**Files:**
- Modify: `prisma/schema.prisma`
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

/// Pedido feito no site (carrinho + Mercado Pago). Não confundir com `Order`,
/// que é o pedido de catálogo recebido pelo WhatsApp.
model SiteOrder {
  id                String            @id @default(uuid())
  /// Vira o código `DV-0001` mostrado pra cliente e pro comprador.
  number            Int               @unique @default(autoincrement())
  /// Vai na URL pública do pedido; o número é sequencial e não pode ser.
  publicToken       String            @unique @default(uuid()) @map("public_token")
  status            SiteOrderStatus   @default(pending_payment)
  fulfillmentStatus FulfillmentStatus @default(awaiting) @map("fulfillment_status")
  customerName      String            @map("customer_name")
  customerEmail     String            @map("customer_email")
  customerPhone     String            @map("customer_phone")
  deliveryMethod    DeliveryMethod    @map("delivery_method")
  cep               String?
  street            String?
  streetNumber      String?           @map("street_number")
  complement        String?
  bairro            String?
  deliveryZone      String?           @map("delivery_zone")
  notes             String?
  subtotal          Decimal           @db.Decimal(10, 2)
  deliveryFee       Decimal           @map("delivery_fee") @db.Decimal(10, 2)
  total             Decimal           @db.Decimal(10, 2)
  mpPreferenceId    String?           @map("mp_preference_id")
  paymentUrl        String?           @map("payment_url")
  mpPaymentId       String?           @map("mp_payment_id")
  mpPaymentStatus   String?           @map("mp_payment_status")
  paidAt            DateTime?         @map("paid_at")
  expiresAt         DateTime          @map("expires_at")
  lastSyncedAt      DateTime?         @map("last_synced_at")
  items             SiteOrderItem[]
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  @@index([status, createdAt])
  @@map("site_orders")
}

model SiteOrderItem {
  id          String    @id @default(uuid())
  orderId     String    @map("order_id")
  order       SiteOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  /// SetNull: o produto pode ser excluído depois; o pedido guarda a foto do momento.
  productId   String?   @map("product_id")
  product     Product?  @relation(fields: [productId], references: [id], onDelete: SetNull)
  productName String    @map("product_name")
  productSlug String?   @map("product_slug")
  imageUrl    String?   @map("image_url")
  unitPrice   Decimal   @map("unit_price") @db.Decimal(10, 2)
  quantity    Int

  @@index([productId])
  @@map("site_order_items")
}

/// Valor de entrega por zona (`DeliveryLocation.zone`). Zona sem linha aqui =
/// entrega indisponível, nunca frete grátis.
model DeliveryZoneFee {
  zone      String   @id
  fee       Decimal  @db.Decimal(10, 2)
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("delivery_zone_fees")
}
```

Em `Product`: `stock Int?` (comentário: "`null` = sem controle de estoque") e `orderItems SiteOrderItem[]`.

- [ ] **Step 2: Squash e aplicar local** — apagar a pasta `*_init` atual, `npx prisma migrate dev --name init`, `npx prisma db seed`, `npm test` (nada deve quebrar: só models novos).
- [ ] **Step 3: Delta de produção** — gerar com `prisma migrate diff` contra a Neon, conferir que só há `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE "products" ADD COLUMN "stock"`, `CREATE INDEX`, `ADD CONSTRAINT`; salvar em `NEON-loja-v1.md` com os passos (`db execute`, `migrate resolve --applied <pasta>`, `migrate status`). **Não aplicar** — o usuário aplica.
- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(site-orders): add site order, zone fee and product stock schema"
```

---

## Task 2: `resolveCep` compartilhado + `GET /delivery-locations/check`

Movida do plano da agenda (`2026-11-04-agenda-eventos.md`, Tarefa 6), **sem mudança de conteúdo** — seguir os passos de lá. O frete (Tarefa 5) chama `DeliveryLocationsService.resolveCep`, então ela vem antes.

Acréscimo: o retorno `covered` passa a trazer a zona, que o frete precisa:

```ts
type CepResolution =
  | { status: 'covered'; bairro: string; zone: string }
  | { status: 'not_covered'; bairro: string }
  | { status: 'unresolved' };
```

O endpoint público continua devolvendo só `{ status, bairro? }` (o site não precisa da zona) — o controller tira `zone` antes de responder.

- [ ] Passos 1–6 da Tarefa 6 do plano da agenda, com o tipo acima.
- [ ] Commit: `feat(delivery-locations): share CEP resolution between bot and site`

---

## Task 3: Frete por zona — `DeliveryZoneFeesService` + admin

**Files:**
- Create: `src/delivery-locations/delivery-zone-fees.service.ts` (+ `.spec.ts`)
- Create: `src/delivery-locations/delivery-zone-fees.controller.ts` (+ `.spec.ts`)
- Create: `src/delivery-locations/dto/update-zone-fee.dto.ts`
- Modify: `src/delivery-locations/delivery-locations.module.ts` (exporta o service)

**Interfaces:**
- Produces: `DeliveryZoneFeesService.list(): Promise<{ zone: string; fee: number | null }[]>`, `.set(zone, fee: number | null)`, `.feeFor(zone): Promise<Prisma.Decimal | null>`.

- [ ] **Step 1: Testes** — `list` traz toda zona distinta de `DeliveryLocation` (mesmo sem fee, com `fee: null`), em ordem alfabética; `set(zone, 12.5)` faz upsert; `set(zone, null)` apaga a linha; `set` numa zona que não existe em `DeliveryLocation` → 404; `feeFor` de zona sem linha → `null`.
- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar** — DTO `{ @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) fee: number | null }`; controller `@Controller('delivery-zone-fees')` com `ClerkAuthGuard`, `GET` e `PUT :zone` (zona vem com espaço/acento: `decodeURIComponent` já é feito pelo Express, só testar com "Zona Sul").
- [ ] **Step 4: Rodar e confirmar que passa; `npm run openapi:metadata`.**
- [ ] **Step 5: Commit** — `feat(delivery-locations): add delivery fee per zone`

---

## Task 4 (opcional — só se a cliente tiver peça única ou estoque contado): estoque

Se a cliente responder que tudo é sob encomenda ou sempre disponível, pular esta tarefa: `stock` fica `null` em todo produto e o resto do plano funciona igual (o cálculo de disponibilidade devolve "ilimitado").

**Files:**
- Create: `src/site-orders/stock.ts` (+ `.spec.ts`)
- Modify: `src/products/dto/create-product.dto.ts` (`stock`), `src/products/products.service.ts` (`ProductAdmin.stock`, `ProductPublic.soldOut`)
- Modify: `test/products.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `availableStock(tx, productIds: string[], now: Date): Promise<Map<string, number | null>>` — `null` = sem controle. Disponível = `stock` − soma das quantidades em `SiteOrderItem` de pedidos `pending_payment` com `expiresAt > now`.
  - `lockProducts(tx, productIds)` — `SELECT id FROM products WHERE id = ANY($1) FOR UPDATE` via `tx.$queryRaw`, chamado no começo da transação de criação do pedido (Tarefa 7) pra serializar checkouts concorrentes do mesmo produto.
  - `ProductPublic.soldOut: boolean`; `ProductAdmin.stock: number | null`.

- [ ] **Step 1: Testes de `availableStock`** — produto sem estoque → `null`; estoque 3 com pendente de 1 válido → 2; pendente vencido não conta; pedido `paid` não conta (já baixou do `stock`); `cancelled`/`expired` não contam.
- [ ] **Step 2: DTO** — `stock` opcional, inteiro ≥ 0, multipart (`@Type(() => Number)`), string vazia = `null` (`@Transform`) pra cliente conseguir "desligar" o controle.
- [ ] **Step 3: `soldOut` no público** — `listActive`/`findActiveBySlug` calculam com `availableStock`; produto esgotado **continua listado** (a cliente decide desativar), só aparece como esgotado.
- [ ] **Step 4: e2e** — produto com `stock: 0` vem `soldOut: true`; sem `stock`, `soldOut: false`.
- [ ] **Step 5: `npm test`, `npm run test:e2e`, `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(products): add optional stock with reservations`

---

## Task 5: Cotação — `POST /checkout/quote`

**Files:**
- Create: `src/site-orders/pricing.ts` (+ `.spec.ts`) — funções puras
- Create: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — começa só com `quote`
- Create: `src/checkout/dto/cart-item.dto.ts`, `src/checkout/dto/quote.dto.ts`
- Create: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`), `src/checkout/checkout.module.ts`, `src/site-orders/site-orders.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `DeliveryLocationsService.resolveCep` (Tarefa 2), `DeliveryZoneFeesService.feeFor` (Tarefa 3), `availableStock` (Tarefa 4, ou um stub que devolve `null` pra tudo se a 4 foi pulada).
- Produces: `CheckoutQuote` (contrato acima); `pricing.ts` exporta `lineTotal(unitPrice: Decimal, qty)`, `orderTotals(lines, deliveryFee): { subtotal, total }` em `Decimal`.

- [ ] **Step 1: Testes de `pricing.ts`** — `19.90 × 3 = 59.70` exato; subtotal + frete; tudo em `Decimal`.
- [ ] **Step 2: Testes de `quote`**:
  - item repetido no corpo (`[{p1,1},{p1,2}]`) é somado (`p1 × 3`);
  - produto inexistente/inativo vira `problems`, não exceção, e fica fora do subtotal;
  - quantidade acima do disponível → `insufficient_stock` com `available`;
  - sem `cep` → `delivery.available: false, reason: 'no_cep'`;
  - CEP `unresolved` / `not_covered` / zona sem fee → motivo respectivo;
  - CEP coberto com fee → `{ available: true, fee, bairro, zone }`;
  - `pickup.address` vem de `STORE_PICKUP_ADDRESS`.
- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar** — DTO com `@ValidateNested({ each: true })`, `@ArrayMinSize(1)`, `@ArrayMaxSize(30)`, `quantity` `@IsInt() @Min(1) @Max(20)`. Controller `@Controller('checkout')` **sem** guard, `@Post('quote') @HttpCode(200)`.
- [ ] **Step 5: Rodar e confirmar que passa; `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(checkout): add cart quote with delivery fee`

---

## Task 6: `MercadoPagoModule` — gateway

**Files:**
- Create: `src/mercado-pago/mercado-pago.gateway.ts` (interface + token de injeção)
- Create: `src/mercado-pago/mercado-pago.service.ts` (+ `.spec.ts`)
- Create: `src/mercado-pago/verify-signature.ts` (+ `.spec.ts`)
- Create: `src/mercado-pago/mercado-pago.module.ts`
- Modify: `package.json` (`npm install mercadopago`), `.env.example`

**Interfaces:**
- Produces:

```ts
export interface PreferenceInput {
  orderId: string;            // vai como external_reference
  code: string;               // DV-0001, no statement_descriptor/título
  items: { id: string; title: string; quantity: number; unitPrice: number; pictureUrl?: string }[];
  deliveryFee: number;        // vira um item "Entrega" (shipments do MP exige Mercado Envios)
  payer: { name: string; email: string };
  backUrl: string;            // `${SITE_URL}/pedido/<token>` pras três back_urls
  expiresAt: Date;
}

export interface MpPayment {
  id: string;
  status: string;             // approved | pending | in_process | rejected | cancelled | refunded | charged_back ...
  externalReference: string | null;
  transactionAmount: number;
  dateApproved: string | null;
}

export interface MercadoPagoGateway {
  createPreference(input: PreferenceInput): Promise<{ id: string; initPoint: string }>;
  getPayment(paymentId: string): Promise<MpPayment>;
  findPaymentsByOrder(orderId: string): Promise<MpPayment[]>;   // GET /v1/payments/search?external_reference=
}
export const MERCADO_PAGO_GATEWAY = Symbol('MERCADO_PAGO_GATEWAY');

// verify-signature.ts
export function isValidMercadoPagoSignature(args: {
  secret: string; signatureHeader: string | undefined; requestId: string | undefined; dataId: string | undefined;
}): boolean;
```

- [ ] **Step 1: Testes de `verify-signature.ts`** (puros, sem rede): header `ts=…,v1=…` válido → `true`; `v1` alterado → `false`; header ausente/malformado → `false`; `data.id` alfanumérico é comparado em minúsculas (regra do MP); gerar o HMAC esperado no próprio teste com `createHmac('sha256', secret).update('id:…;request-id:…;ts:…;')`.
- [ ] **Step 2: Testes do service** com o SDK mockado (`jest.mock('mercadopago')`): `createPreference` manda `external_reference`, `notification_url = ${API_PUBLIC_URL}/webhooks/mercado-pago`, `back_urls` nas três chaves, `auto_return: 'approved'`, `expires: true`, `expiration_date_to`, `date_of_expiration` (Pix), `excluded_payment_types: [{ id: 'ticket' }]`, item de entrega só quando `deliveryFee > 0`; `getPayment` mapeia `external_reference`/`transaction_amount`.
- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar.** Sem `MP_ACCESS_TOKEN` o módulo sobe (como `PushNotificationsService` sem VAPID), mas `createPreference` lança `ServiceUnavailableException` — a API inteira não pode cair por falta da credencial da loja.
- [ ] **Step 5: Rodar e confirmar que passa.**
- [ ] **Step 6: Commit** — `feat(mercado-pago): add Checkout Pro gateway and webhook signature check`

---

## Task 7: Criar pedido — `POST /checkout`

**Files:**
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `create`
- Create: `src/checkout/dto/create-checkout.dto.ts`
- Modify: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`)
- Create: `src/site-orders/order-code.ts` (`formatOrderCode(42) === 'DV-0042'`, + `.spec.ts`)

**Interfaces:**
- Consumes: `quote` (Tarefa 5), `lockProducts`/`availableStock` (Tarefa 4), `MercadoPagoGateway.createPreference` (Tarefa 6).
- Produces: `SiteOrdersService.create(dto): Promise<{ code; token; paymentUrl }>`.

Ordem dentro do `create`, numa transação interativa:

1. `lockProducts` nos produtos do carrinho;
2. recalcular a cotação dentro da transação; `problems` não vazio → `ConflictException({ message, problems })` (409);
3. `deliveryMethod = 'delivery'` sem entrega disponível → `UnprocessableEntityException({ message, reason })` (422);
4. criar `SiteOrder` + itens (snapshot de nome, slug, primeira foto, preço), `expiresAt = now + 60 min`;

Depois da transação (chamada externa não fica dentro do lock):

5. `createPreference`; gravar `mpPreferenceId` e `paymentUrl`;
6. se o MP falhar: marcar o pedido `cancelled` (libera a reserva na hora) e responder 503 "Não foi possível iniciar o pagamento. Tente de novo em instantes."

- [ ] **Step 1: Testes do service** — caminho feliz (snapshot correto, total = subtotal + frete do banco, `expiresAt` +60 min, preferência chamada com o `id` do pedido); 409 com `problems`; 422 sem entrega; `pickup` ignora endereço e grava frete 0; falha do MP cancela o pedido e devolve 503; telefone salvo normalizado.
- [ ] **Step 2: DTO** — `customer.name` 2–100, `@IsEmail()`, telefone com 10–13 dígitos depois de limpar; `address` obrigatório só com `delivery` (`@ValidateIf`), `cep` 8 dígitos depois de limpar.
- [ ] **Step 3: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa.**
- [ ] **Step 4: e2e de concorrência** (`test/checkout.e2e-spec.ts`, gateway trocado por fake com `overrideProvider(MERCADO_PAGO_GATEWAY)`): produto `stock: 1`, dois `POST /checkout` em `Promise.all` → um 201, um 409. (Pular se a Tarefa 4 foi pulada.)
- [ ] **Step 5: `npm run openapi:metadata`.**
- [ ] **Step 6: Commit** — `feat(checkout): create site orders with Mercado Pago preference`

---

## Task 8: Webhook e máquina de status

**Files:**
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `applyPayment`
- Create: `src/checkout/mercado-pago-webhook.controller.ts` (+ `.spec.ts`)
- Modify: `src/push-notifications/push-notifications.service.ts` (+ `.spec.ts`) — `notifyNewOrder`
- Modify: `src/checkout/checkout.module.ts` (importa `PushNotificationsModule`)

**Interfaces:**
- Produces:
  - `SiteOrdersService.applyPayment(payment: MpPayment): Promise<void>`
  - `PushNotificationsService.notifyNewOrder({ id, code, total, customerName }): Promise<void>` — título "Novo pedido DV-0042", corpo "Maria · R$ 159,80", `url: /admin/pedidos/<id>`.

Regras do `applyPayment`:

| `payment.status` | Efeito no pedido |
|---|---|
| `approved` | se `transactionAmount` ≠ `total` → só loga erro e grava `mpPaymentStatus`; senão `status = paid`, `paidAt`, `mpPaymentId`; **se essa transição de fato aconteceu** (`updateMany` com `status: { not: 'paid' }` retornou 1): baixa `stock` dos itens (`decrement`, só onde `stock` não é `null`) e `notifyNewOrder` |
| `pending`, `in_process`, `authorized` | só grava `mpPaymentId`/`mpPaymentStatus` |
| `rejected`, `cancelled` | só grava `mpPaymentStatus` (o cliente pode tentar de novo até vencer) |
| `refunded`, `charged_back` | `status = refunded`; se estava `paid`, devolve o estoque |

Pedido `expired`/`cancelled` que recebe `approved` (Pix gerado antes de vencer e pago no limite): vira `paid` mesmo assim — o dinheiro entrou — e o push leva "⚠️ pago depois de vencer, confira o estoque".

Controller:

```ts
@ApiExcludeController()
@Controller('webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  @Post()
  @HttpCode(200)
  async handle(@Query() query: Record<string, string>, @Headers('x-signature') signature?: string, @Headers('x-request-id') requestId?: string) {
    const dataId = query['data.id'];
    if (!isValidMercadoPagoSignature({ secret: process.env.MP_WEBHOOK_SECRET ?? '', signatureHeader: signature, requestId, dataId })) {
      throw new UnauthorizedException();
    }
    if (query.type !== 'payment' || !dataId) return;          // outros tópicos: 200 e ignora
    const payment = await this.gateway.getPayment(dataId);    // erro aqui = 500, MP reenvia
    if (!payment.externalReference) return;
    await this.orders.applyPayment(payment);                  // pedido desconhecido: no-op
  }
}
```

O webhook do Mercado Pago manda JSON normal e a assinatura usa a query, não o corpo cru — não precisa do `RawBodyMiddleware` do WhatsApp. Conferir em `bootstrap.ts` que a rota nova recebe o parser JSON padrão.

- [ ] **Step 1: Testes de `applyPayment`** — cada linha da tabela; **mesmo `approved` 3 vezes → 1 push e 1 decremento**; valor divergente não vira `paid`; pedido desconhecido não lança; `refunded` depois de `paid` devolve estoque.
- [ ] **Step 2: Testes do controller** — assinatura inválida → 401 e gateway não chamado; `type=merchant_order` → 200 sem chamar gateway; erro do gateway propaga (500).
- [ ] **Step 3: Teste do `notifyNewOrder`** no mesmo molde dos de `notifyNewMessage`.
- [ ] **Step 4: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa.**
- [ ] **Step 5: Commit** — `feat(checkout): process Mercado Pago payment notifications`

---

## Task 9: Página pública do pedido + reconciliação + vencimento

**Files:**
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `findPublicByToken`, `syncWithMercadoPago`, `expireIfDue`
- Modify: `src/checkout/public-checkout.controller.ts` (+ `.spec.ts`)

**Interfaces:**
- Produces: `GET /checkout/orders/:token` → `PublicSiteOrder`; `SiteOrdersService.syncWithMercadoPago(orderId): Promise<void>` (reaproveitado pelo admin na Tarefa 10).

`findPublicByToken`:
1. acha pelo `publicToken` (404 se não existe);
2. se `pending_payment` e `lastSyncedAt` é nulo ou tem mais de 60 s: `syncWithMercadoPago` = `findPaymentsByOrder(id)` e `applyPayment` em cada um (o mais recente por último), grava `lastSyncedAt`. Falha do MP aqui **não** derruba a página: loga e segue com o que está no banco;
3. se continua `pending_payment` e `expiresAt` já passou: `status = expired` (`updateMany` com `status: 'pending_payment'`, pra não atropelar um `paid` concorrente);
4. monta `PublicSiteOrder` — sem rua, número, telefone, e-mail; `paymentUrl` só se `pending_payment`.

- [ ] **Step 1: Testes** — token inexistente 404; pendente dentro do prazo chama o MP uma vez e não chama de novo em 60 s; MP fora do ar não lança; pendente vencido vira `expired`; resposta não tem campos de endereço/contato (`expect(Object.keys(body)).not.toContain('street')` etc.).
- [ ] **Step 2: Rodar e confirmar que falha. Implementar. Rodar e confirmar que passa.**
- [ ] **Step 3: Commit** — `feat(checkout): expose public order page with payment reconciliation`

---

## Task 10: Admin de pedidos — `/site-orders`

**Files:**
- Create: `src/site-orders/site-orders.controller.ts` (+ `.spec.ts`)
- Create: `src/site-orders/dto/list-site-orders.query.ts`, `src/site-orders/dto/update-fulfillment.dto.ts`
- Modify: `src/site-orders/site-orders.service.ts` (+ `.spec.ts`) — `list`, `findById`, `updateFulfillment`, `cancel`

**Interfaces:**
- Produces: `SiteOrderAdmin` (tudo do pedido + `code`, valores como número, itens) e as rotas de admin do bloco "Contratos".

- [ ] **Step 1: Testes**:
  - `list` paginado (`pageBounds`/`paginated` de `src/common/pagination.ts`), mais recente primeiro, filtro por `status`; **padrão sem filtro mostra só `paid`** (é o que a cliente precisa ver no dia a dia; pendentes/vencidos ficam atrás do filtro);
  - `updateFulfillment` só em pedido `paid` (senão 409);
  - `cancel`: `pending_payment` → `cancelled`; `paid` → `cancelled` + devolve estoque; já `cancelled`/`refunded` → 409;
  - `findById` de pedido pendente chama `syncWithMercadoPago` (mesma regra de 60 s);
  - `POST :id/sync` força a sincronização ignorando os 60 s.
- [ ] **Step 2: Rodar e confirmar que falha. Implementar** (controller com `ClerkAuthGuard`; `SiteOrdersModule` registra este controller **depois** de qualquer controller público). **Rodar e confirmar que passa.**
- [ ] **Step 3: `npm run openapi:metadata`.**
- [ ] **Step 4: Commit** — `feat(site-orders): add admin order list, fulfillment and cancel`

---

## Task 11: Fechamento — e2e, docs, homologação e produção

- [ ] **Step 1: e2e** `test/checkout.e2e-spec.ts` (banco real, gateway fake): quote → create → webhook `approved` assinado com o secret de teste → `GET /checkout/orders/:token` mostra `paid` → `GET /site-orders` (sem token → 401). Conferir que o CI continua verde (o e2e conta linhas do seed: nada aqui mexe no seed).
- [ ] **Step 2: README** — seção "Loja online (módulos checkout, site-orders, mercado-pago)": fluxo, máquina de status, variáveis, como testar com credenciais de teste e túnel, e o aviso de que estorno é no painel do MP na V1. Atualizar `CLAUDE.md` (o webhook novo também tem que responder 2xx; `SiteOrder` ≠ `Order`).
- [ ] **Step 3: Homologação com o Mercado Pago de teste** (manual, documentar o resultado no PR): usuário comprador de teste; cartão aprovado; cartão recusado e depois aprovado no mesmo pedido; Pix pendente que vence; webhook derrubado (URL errada) e a página do pedido reconciliando sozinha.
- [ ] **Step 4: Produção** (usuário executa): aplicar `NEON-loja-v1.md`; cadastrar `MP_ACCESS_TOKEN` **de produção**, `MP_WEBHOOK_SECRET`, `SITE_URL`, `API_PUBLIC_URL`, `STORE_PICKUP_ADDRESS` na Vercel; configurar a URL do webhook no painel do Mercado Pago (tópico "Pagamentos"); `FRONTEND_URL` já cobre o domínio do site (CORS). Primeira compra real de valor baixo, estornada pelo painel.
- [ ] **Step 5: Commit** — `docs: document the online store`

---

## Depois da V1 (fora deste plano)

- **V2 — pagamento dentro do site (Checkout Bricks):** troca só a Tarefa 6/7 (pagamento criado pela API com o token do Brick em vez de preferência) e a tela de pagamento do site; pedido, webhook, status e admin ficam iguais. Estimativa: 16–24 h.
- Estorno pela API no botão de cancelar.
- E-mail próprio de confirmação e de "pedido pronto/saiu pra entrega".
- Boleto (com reserva mais longa), cupom de desconto, frete grátis acima de um valor, envio pelos Correios pra fora do Rio.
- Pedido do site aparecendo na conversa do WhatsApp do mesmo telefone.

## Self-review (feito ao escrever este plano)

- **Cobertura do pedido do usuário:** cadastro de produto (está no plano irmão, Fase 1, porque a API já existe — aqui só o `stock` opcional), exibição no front (feita), V1 com redirect pro Mercado Pago (Tarefas 5–9), admin de pedidos (Tarefa 10). V2 explicitamente fora.
- **Nomes conferidos contra o código:** `Order`/`OrderItem` já existem (pedido do WhatsApp) → models novos com prefixo `Site`; `DeliveryLocation.zone` é `String` livre → `DeliveryZoneFee.zone` é a chave por texto; `PushNotificationsService` só tem `notifyNewMessage` → `notifyNewOrder` é novo; `vercel.json` só tem o cron diário de mídia → nada de cron novo (decisão 11).
- **Dependências entre tarefas:** 1 → 2 → 3 → (4) → 5 → 6 → 7 → 8 → 9 → 10 → 11. A Tarefa 6 não depende de nada e pode andar em paralelo com 2–5.
- **Riscos maiores ficaram em tarefas próprias com teste dedicado:** idempotência do webhook (8), corrida de estoque (4/7), webhook perdido (9).
