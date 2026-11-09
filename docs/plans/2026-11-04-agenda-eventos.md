# Agenda de eventos — plano de implementação (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Atualizado em 2026-11-04 (revisão da cliente):** a faixa de eventos acima do cabeçalho foi **removida** do site, então o campo `highlight` sai do contrato, do model e do DTO (removido abaixo; a decisão 6 não vale mais). E os slides do hero **voltam** como feature própria, pra depois: o site já lê `GET /hero-slides/active` (contrato em `src/features/site/types/hero-slide.ts` no `daverdinha`) e, sem a rota, mostra um slide fixo — com 2+ slides vira slideshow. Esse backend ainda não tem plano.

> **Atualizado em 2026-11-06 (venda de ingresso):** a agenda vira pré-requisito da venda de ingressos, planejada em `2026-11-05-loja-online-v1.md` (Tarefas 11–13). Este plano não muda: os campos novos (`ticketSales`, `maxTicketsPerOrder`, e no público `spotsLeft`/`soldOut`) e a regra de que `spots` passa a ser lotação de verdade quando a venda está ligada entram por lá, depois das Tarefas 1–5 daqui.

**Goal:** dar à Daverdinha uma agenda de eventos (oficinas, feirinhas, aulas no ateliê) que a cliente cadastra sozinha no admin e o site mostra em `/agenda`, numa página por evento (`/agenda/[slug]`) e na seção "Próximos eventos" da home. Substitui a antiga tela "Destaques" do admin, que nunca foi construída.

**Architecture:** um model novo no Postgres (`Event`) e um módulo NestJS `src/events/` seguindo o mesmo padrão do catálogo (`docs/plans/2026-11-04-catalogo-produtos.md`): service + controller admin protegido por `ClerkAuthGuard` + **controller público separado** (como `PublicDeliveryLocationsController`) + DTOs + testes colocados em `src/`. Foto do evento vai pro mesmo Vercel Blob do catálogo — `BlobStorageService` (Tarefa 3 do plano do catálogo) ganha um método pra prefixo `events/`. Slug reaproveita `uniqueSlug` de `src/common/slug.ts` (Tarefa 2 do plano do catálogo). **Este plano depende dessas duas tarefas do catálogo já estarem no `main`**; se não estiverem, fazê-las primeiro, como estão lá.

Evento passado **não é apagado nem despublicado por ninguém**: a lista pública filtra por `endsAt >= now()` na consulta, então ele some das listas sozinho, mas a página dele continua no ar (o site mostra "Este evento já aconteceu") pra link antigo — compartilhado no Instagram, no WhatsApp — não virar 404.

**Tech Stack:** NestJS 11, Prisma (Postgres), `@vercel/blob` (instalado pelo plano do catálogo), `@nestjs/platform-express` (`FileInterceptor`, já instalado), class-validator/class-transformer (já em uso).

**Spec:** não existe um spec separado — a proposta nova do site (aprovada pelo usuário em 2026-11-04) trocou "Destaques" por "Agenda de eventos" e fechou o contrato abaixo, que o frontend (`daverdinha`) já está implementando em `src/features/site/types/event.ts`. Fonte da verdade pros nomes de campo:

```ts
// GET /events/upcoming  -> SiteEvent[]   (publicados com endsAt >= agora, por startsAt asc)
// GET /events/:slug     -> SiteEvent     (qualquer publicado, inclusive passado; 404 se não existe/não publicado)
interface SiteEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startsAt: string;              // ISO 8601
  endsAt: string;                // ISO 8601
  locationName: string | null;   // null = no ateliê, o site usa o endereço da loja
  locationAddress: string | null;
  price: number | null;          // null = "Gratuito"
  spots: number | null;
  imageUrl: string | null;
  ctaUrl: string | null;         // null = WhatsApp com mensagem pronta montada pelo site
}
```

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Agenda substitui Destaques.** Nada de `/hero-slides` (nunca existiu aqui); o hero do site é estático. No frontend, o item de nav e a página stub de `/admin/destaques` já foram removidos; `/admin/agenda` entra no lugar quando isto for ao ar. |
| 2 | **Cadastro no admin**, com `published` (rascunho por padrão): a cliente pode montar o evento com calma e só publicar quando estiver pronto. Evento não publicado não aparece em **nenhum** endpoint público. |
| 3 | **Passado some sozinho, por data.** `GET /events/upcoming` filtra `endsAt >= now()`; não existe job, cron nem flag "arquivado" — nada pra lembrar de fazer, e serverless não tem processo em background mesmo. |
| 4 | **Página de evento passado continua no ar.** `GET /events/:slug` devolve qualquer evento publicado, passado ou futuro; quem decide mostrar "Este evento já aconteceu" é o site, comparando `endsAt` com a hora atual. |
| 5 | **`null` tem significado, não é "faltou preencher"**: `locationName: null` = no ateliê (site usa o endereço da loja); `price: null` = gratuito; `spots: null` = sem limite divulgado; `ctaUrl: null` = inscrição pelo WhatsApp com mensagem pronta; `imageUrl: null` = site usa placeholder. O admin precisa conseguir **voltar** um campo pra `null` (ver Tarefa 3). |
| 6 | ~~`highlight`~~ — removido junto com a faixa de eventos do site (ver nota no topo). |
| 7 | **Slug gerado do título na criação, estável ao renomear** — mesma regra e mesmo helper (`uniqueSlug`) do catálogo. `upcoming` é reservado (colidiria com a rota `GET /events/upcoming`). |
| 8 | **Uma foto por evento** (`imageUrl: String?`), não array — a página do evento tem uma capa, não galeria. Upload no mesmo Vercel Blob do catálogo, prefixo `events/`. |
| 9 | **Agenda vazia não é erro.** Zero eventos futuros → `[]` com 200, mesmo padrão de `delivery-locations/covered` e do catálogo. |
| 10 | **Datas em UTC na API.** Banco guarda `DateTime` (UTC); a API devolve ISO com `Z`. Conversão de/para `America/Sao_Paulo` é responsabilidade do front (formulário do admin e formatação no site). |

## Global Constraints

- **Migration única**: o projeto squasha o histórico Prisma num único `_init` (ver README, "Migration única + banco de produção com dado real"). Ao mexer em `schema.prisma`, apague `prisma/migrations/` e regenere uma migration única — **localmente**.
- **⚠️ Banco de produção com dado real** (README → "Migration única + banco de produção com dado real"): há banco de produção no ar (Neon) com conversas, mensagens, menu, entregas — e, depois do catálogo, produtos. Rodar `prisma migrate reset` ou `prisma migrate deploy` contra ele depois de regenerar a migration **apaga tudo** (o nome/checksum da migration muda a cada squash, o Prisma tenta recriar o schema do zero). Caminho seguro em produção:
  1. `npx prisma migrate diff --from-url "<url de produção>" --to-schema-datamodel prisma/schema.prisma --script > delta.sql`
  2. **Ler o `delta.sql` inteiro.** Pra este plano o esperado é só `CREATE TABLE "events"` + `CREATE UNIQUE INDEX`/`CREATE INDEX` — qualquer `DROP`/`TRUNCATE`/`ALTER ... DROP` é motivo pra parar.
  3. `DATABASE_URL="<url de produção>" npx prisma db execute --file delta.sql`
  4. `DATABASE_URL="<url de produção>" npx prisma migrate resolve --applied <nome_da_pasta_da_migration>`
  5. `npx prisma migrate status` → "Database schema is up to date!".
- **Vercel serverless**: sem disco persistente, sem processo em background — upload acontece inteiro na requisição, buffer em memória; "evento passado some" é filtro de consulta, não job (decisão 3).
- Testes ficam ao lado do arquivo testado, dentro de `src/` (`rootDir: 'src'`).
- Toda rota admin usa `@UseGuards(ClerkAuthGuard)`; toda rota pública fica num **controller separado**, sem guard — mesmo padrão de `PublicDeliveryLocationsController` (rota pública é um fato estrutural, não um decorator que falta notar).
- `ValidationPipe({ whitelist: true, transform: true })` já é global (`bootstrap.ts`) — DTOs não precisam reconfigurar isso.

## Review Focus

- **Rascunho nunca vaza**: evento com `published: false` não aparece em `/events/upcoming` **nem** em `/events/:slug` (404), mesmo que o slug seja conhecido.
- **Passado: some da lista, fica na página**: `/events/upcoming` exclui `endsAt < now`; `/events/:slug` de evento publicado e passado devolve 200. Atenção a "agora": `now` tem que ser calculado **por requisição** (dentro do método), nunca numa constante de módulo — em serverless a instância vive por vários minutos e a lista congelaria.
- **Evento em andamento continua na lista**: o filtro é por `endsAt`, não `startsAt` — uma oficina das 14h às 17h ainda aparece às 15h.
- **Colisão de rota**: `GET /events/upcoming` não pode ser capturado por `GET /events/:slug` (ordem dos métodos no controller público) nem pelo controller admin (controller público registrado primeiro, e o admin **não** tem `GET /events/:id` — ver Tarefa 4). Um evento chamado "Upcoming" não pode ganhar o slug `upcoming`.
- **`endsAt` antes de `startsAt`**: 400 na criação e na edição (inclusive edição parcial que muda só um dos dois — validar contra o valor salvo).
- **Voltar campo pra `null`**: no multipart, campo opcional enviado vazio (`price=""`, `ctaUrl=""`) vira `null` no banco — não `0`, não `""`, não "ignorado". Sem isso a cliente não consegue transformar um evento pago em gratuito.
- **Preço sem perder centavo**: `Decimal?` serializa como string em JSON — converter pra `number | null` em toda leitura, mesmo cuidado do catálogo.
- **Upload inválido**: mimetype fora da lista ou acima do teto → 400 antes de subir qualquer coisa ao Blob; trocar/remover a foto apaga a antiga do Blob; excluir o evento apaga a foto.

---

## Task 1: Schema — `Event`

**Files:**
- Modify: `prisma/schema.prisma`
- Delete + regenerate: `prisma/migrations/` (migration única, ver Global Constraints)

**Interfaces:**
- Produces (pro resto do plano): o model abaixo, exatamente com estes nomes de campo (camelCase no client Prisma, `@map` snake_case no banco).

```prisma
model Event {
  id              String   @id @default(uuid())
  title           String
  slug            String   @unique
  description     String
  startsAt        DateTime @map("starts_at")
  endsAt          DateTime @map("ends_at")
  locationName    String?  @map("location_name")
  locationAddress String?  @map("location_address")
  price           Decimal? @db.Decimal(10, 2)
  spots           Int?
  imageUrl        String?  @map("image_url")
  ctaUrl          String?  @map("cta_url")
  published       Boolean  @default(false)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([published, endsAt])
  @@map("events")
}
```

`@@index([published, endsAt])` atende exatamente a consulta de `/events/upcoming` (`published = true AND ends_at >= now()`). Nome do model `Event` sombreia o `Event` global do DOM só dentro de arquivos que importam de `@prisma/client` — inofensivo no Node, mas importar com nome explícito (`import { Event as EventRow } ...`) onde houver ambiguidade.

- [ ] **Step 1: Adicionar o model ao `schema.prisma`**, exatamente como acima.
- [ ] **Step 2: Apagar `prisma/migrations/` e regenerar a migration única (local)**

Run: `rm -rf prisma/migrations && npx prisma migrate dev --name init`
Expected: uma única pasta nova em `prisma/migrations/`, aplicada num Postgres **local**, `prisma generate` sem erro. Produção só pelo caminho do delta (Global Constraints).

- [ ] **Step 3: Seed de exemplo** — `seedEvents()` em `prisma/seed.ts` com os mesmos eventos de `sampleEvents()` do site (`src/features/site/data/samples.ts` no `daverdinha`), datas relativas a hoje (dois futuros e um passado, pra testar "Este evento já aconteceu"), `upsert` por `slug` com `update: {}` (nunca desfaz edição do admin), sem foto. Rodar `npx prisma db seed` duas vezes e conferir que não duplica.
- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Event model for the site agenda"
```

---

## Task 2: `BlobStorageService` — foto de evento

**Files:**
- Modify: `src/media/blob-storage.service.ts`
- Modify: `src/media/blob-storage.service.spec.ts`

**Interfaces:**
- Consumes: `BlobStorageService` existente (Tarefa 3 do plano do catálogo).
- Produces: `BlobStorageService.uploadEventImage(buffer: Buffer, mimeType: string): Promise<string>` e `BlobStorageService.deleteImage(url: string): Promise<void>` — a Tarefa 3 usa os dois.

Não duplica a lógica: extrair o corpo de `uploadProductImage` pra um privado `upload(prefix, buffer, mimeType)` e fazer `uploadProductImage`/`uploadEventImage` delegarem com `'products'`/`'events'`. `deleteImage` é o `deleteProductImage` com nome neutro — manter `deleteProductImage` como alias (ou renomear e ajustar `ProductsService` no mesmo commit, o que for menor).

- [ ] **Step 1: Teste**

```ts
it('uploads event images under the events/ prefix', async () => {
  (put as jest.Mock).mockResolvedValue({ url: 'https://abc.public.blob.vercel-storage.com/events/x.webp' });
  await service.uploadEventImage(Buffer.from('fake'), 'image/webp');
  expect(put).toHaveBeenCalledWith(
    expect.stringMatching(/^events\/.+\.webp$/),
    expect.any(Buffer),
    expect.objectContaining({ access: 'public', contentType: 'image/webp' }),
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar** (refatoração descrita acima; testes de produto existentes continuam passando sem mudança).
- [ ] **Step 4: Rodar e confirmar que passa** — `npx jest blob-storage`.
- [ ] **Step 5: Commit**

```bash
git add src/media/blob-storage.service.ts src/media/blob-storage.service.spec.ts
git commit -m "feat(media): support event images in BlobStorageService"
```

---

## Task 3: `EventsService` — regras de negócio

**Files:**
- Create: `src/events/events.service.ts`
- Test: `src/events/events.service.spec.ts`
- Create: `src/events/dto/create-event.dto.ts`, `dto/update-event.dto.ts`

**Interfaces:**
- Consumes: `Event` (Tarefa 1), `uniqueSlug` (`src/common/slug.ts`, plano do catálogo), `BlobStorageService.uploadEventImage`/`deleteImage` (Tarefa 2).
- Produces: `EventsService.list(query: PaginationQueryDto): Promise<Paginated<EventAdmin>>`, `.create(dto, file?: Express.Multer.File): Promise<EventAdmin>`, `.update(id, dto, file?): Promise<EventAdmin>`, `.remove(id): Promise<void>`, `.listUpcoming(): Promise<SiteEvent[]>`, `.findPublishedBySlug(slug): Promise<SiteEvent | null>` — Tarefas 4 e 5 chamam esses métodos; os shapes abaixo são o contrato final.

```ts
// público — exatamente o SiteEvent do topo; datas como ISO string, price number | null
interface SiteEvent {
  id: string; title: string; slug: string; description: string;
  startsAt: string; endsAt: string;
  locationName: string | null; locationAddress: string | null;
  price: number | null; spots: number | null;
  imageUrl: string | null; ctaUrl: string | null;
}
// EventAdmin = SiteEvent + { published: boolean; createdAt: string; updatedAt: string }
```

- [ ] **Step 1: DTOs** — chegam via `multipart/form-data` (por causa da foto), então tudo vem como string:

```ts
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateEventDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() description: string;
  @IsISO8601() startsAt: string;
  @IsISO8601() endsAt: string;
  @IsOptional() @Transform(emptyToNull) @IsString() locationName?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() locationAddress?: string | null;
  @IsOptional() @Transform(({ value }) => (value === '' ? null : Number(value))) @IsNumber() @Min(0) price?: number | null;
  @IsOptional() @Transform(({ value }) => (value === '' ? null : Number(value))) @IsInt() @Min(1) spots?: number | null;
  @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['https'], require_protocol: true }) ctaUrl?: string | null;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() published?: boolean;
}
export class UpdateEventDto extends PartialType(CreateEventDto) {
  /** `'true'` apaga a foto atual sem mandar outra (volta pro placeholder do site). */
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() removeImage?: boolean;
}
```

`@IsOptional()` deixa passar `null` sem validar — é o que permite "voltar pra `null`" (decisão 5): `price=""` → `null` → grava `null`. Booleans com `@Transform` pelo mesmo motivo do catálogo (`Boolean('false') === true`).

- [ ] **Step 2: Testes**

```ts
describe('EventsService', () => {
  describe('create', () => {
    it('generates a slug from the title', async () => { /* 'Oficina de Kokedama' -> 'oficina-de-kokedama' */ });
    it('never generates the reserved slug "upcoming"', async () => { /* título 'Upcoming' -> 'upcoming-2' */ });
    it('rejects endsAt before startsAt with BadRequestException', async () => { /* ... */ });
    it('starts as a draft (published false) unless told otherwise', async () => { /* ... */ });
    it('uploads the image via BlobStorageService and stores its URL', async () => { /* ... */ });
    it('returns price as number | null, not a Decimal/string', async () => {
      // mock do Prisma com price: new Prisma.Decimal('45.00') -> 45; price: null -> null
    });
  });

  describe('update', () => {
    it('keeps the slug when the title changes', async () => { /* data sem `slug` */ });
    it('validates endsAt against the stored startsAt on a partial update', async () => {
      // salvo: startsAt 14h; update({ endsAt: 13h }) -> BadRequestException
    });
    it('stores null when an optional field is cleared', async () => { /* { price: null } -> data.price === null */ });
    it('replaces the image, deleting the old one from Blob', async () => { /* ... */ });
    it('removes the image when removeImage is true', async () => { /* deleteImage chamado, imageUrl null */ });
  });

  describe('remove', () => {
    it('deletes the image from Blob before removing the row', async () => { /* ... */ });
  });

  describe('listUpcoming', () => {
    it('returns [] when there are no upcoming events', async () => { /* ... */ });
    it('only returns published events that have not ended, ordered by startsAt asc', async () => {
      // espera where: { published: true, endsAt: { gte: <Date> } }, orderBy: { startsAt: 'asc' }
    });
    it('computes "now" on every call', async () => {
      // jest.setSystemTime(t1); listUpcoming(); jest.setSystemTime(t2); listUpcoming();
      // o `gte` das duas chamadas é diferente
    });
    it('exposes only the public fields, with ISO date strings', async () => { /* sem published/createdAt; startsAt termina em 'Z' */ });
  });

  describe('findPublishedBySlug', () => {
    it('returns a past published event', async () => { /* endsAt no passado -> devolvido */ });
    it('returns null for a draft', async () => { /* published false -> null */ });
    it('returns null for an unknown slug', async () => { /* ... */ });
  });

  describe('list (admin)', () => {
    it('includes drafts and past events, newest startsAt first, paginated', async () => { /* ... */ });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar `EventsService`**
  - `create`: `slug = await uniqueSlug(dto.title, (s) => s === 'upcoming' || exists(s))`; valida `endsAt >= startsAt` (`BadRequestException('O evento não pode terminar antes de começar.')`); sobe a foto se vier; `price` → `Prisma.Decimal` na escrita.
  - `update`: carrega o evento (404 se não existe), valida datas contra `{ ...salvo, ...dto }`, nunca recalcula `slug`; foto nova → sobe a nova, apaga a antiga; `removeImage` → apaga e grava `imageUrl: null`.
  - `remove`: apaga a foto no Blob (se houver), depois a linha.
  - `listUpcoming`: `const now = new Date()` **dentro** do método; `where: { published: true, endsAt: { gte: now } }`, `orderBy: { startsAt: 'asc' }`.
  - `findPublishedBySlug`: `where: { slug, published: true }` — sem filtro de data (decisão 4).
  - `list`: `orderBy: { startsAt: 'desc' }`, paginado com `pageBounds`/`paginated` de `src/common/pagination.ts`, igual `CategoriesService.list`.
  - Um único mapeamento `toSiteEvent(row)` (datas `.toISOString()`, `price?.toNumber() ?? null`) usado por toda leitura; `toEventAdmin(row)` estende ele.
- [ ] **Step 5: Rodar e confirmar que passa.**
- [ ] **Step 6: Commit**

```bash
git add src/events/events.service.ts src/events/events.service.spec.ts src/events/dto
git commit -m "feat(events): add EventsService"
```

---

## Task 4: `EventsController` — admin, multipart

**Files:**
- Create: `src/events/events.controller.ts`
- Test: `src/events/events.controller.spec.ts`

**Interfaces:**
- Consumes: `EventsService` (Tarefa 3).
- Produces: `GET /events` (paginado), `POST /events`, `PATCH /events/:id`, `DELETE /events/:id`, todas com `@UseGuards(ClerkAuthGuard)` — consumidas por `/admin/agenda` no frontend.

**Sem `GET /events/:id` no admin, de propósito**: colidiria com o público `GET /events/:slug` (mesmo padrão de rota). A lista admin já devolve `EventAdmin` completo, que é tudo o que o dialog de edição precisa — mesmo jeito que `/admin/categorias` edita a partir da lista.

- [ ] **Step 1: Testes** — mesma forma de `src/categories/categories.controller.spec.ts` (service mockado, cada rota chama o método certo com os argumentos certos), mais:

```ts
it('rejects an image that is not jpeg/png/webp with a 400', async () => { /* fileFilter */ });
it('rejects an image over 5MB with a 400', async () => { /* limits.fileSize */ });
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar** — `POST`/`PATCH` com `@UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES }, fileFilter }))` e `@UploadedFile() file?: Express.Multer.File`; mesmas constantes `ALLOWED_IMAGE_MIMETYPES`/`MAX_IMAGE_BYTES` do `ProductsController` — se ainda estiverem locais lá, mover pra `src/media/image-upload.ts` e importar dos dois (não copiar).
- [ ] **Step 4: Rodar e confirmar que passa.**
- [ ] **Step 5: Commit**

```bash
git add src/events/events.controller.ts src/events/events.controller.spec.ts
git commit -m "feat(events): add admin EventsController"
```

---

## Task 5: `PublicEventsController` — leitura sem autenticação + módulo

**Files:**
- Create: `src/events/public-events.controller.ts`
- Test: `src/events/public-events.controller.spec.ts`
- Create: `src/events/events.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `EventsService.listUpcoming()`, `.findPublishedBySlug()` (Tarefa 3).
- Produces: `GET /events/upcoming`, `GET /events/:slug` — **sem guard**, contrato público que o site consome via `getUpcomingEvents()`/`getEventBySlug()` (`src/features/site/lib/public-api.ts` no `daverdinha`).

- [ ] **Step 1: Testes**

```ts
describe('PublicEventsController', () => {
  it('GET /events/upcoming returns [] with no auth required, even with zero events', async () => { /* ... */ });
  it('GET /events/:slug returns a past published event', async () => { /* 200 */ });
  it('GET /events/:slug returns 404 for a draft or unknown slug', async () => { /* NotFoundException */ });
});
```

E um e2e curto (em `test/`, junto dos existentes) garantindo a ordem das rotas: `GET /events/upcoming` sem token responde 200 com array — não 401 (admin) nem 404 (`:slug = 'upcoming'`).

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar**

```ts
/**
 * Separado do controller admin pelo mesmo motivo de
 * `PublicDeliveryLocationsController`: "esta rota é pública" é um fato
 * estrutural. Nada aqui pode expor rascunho (`published: false`).
 */
@ApiTags('events')
@Controller('events')
export class PublicEventsController {
  constructor(private readonly service: EventsService) {}

  // Declarado antes de `:slug` — a ordem dos métodos decide o match.
  @Get('upcoming')
  listUpcoming() { return this.service.listUpcoming(); }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const event = await this.service.findPublishedBySlug(slug);
    if (!event) throw new NotFoundException();
    return event;
  }
}
```

- [ ] **Step 4: `EventsModule`** — controller público **antes** do admin, mesmo motivo de `DeliveryLocationsModule`:

```ts
@Module({
  imports: [ClerkAuthModule, BlobStorageModule],
  providers: [EventsService],
  controllers: [PublicEventsController, EventsController],
})
export class EventsModule {}
```

- [ ] **Step 5: Rodar e confirmar que passa** (unitários + o e2e da ordem de rotas).
- [ ] **Step 6: Adicionar `EventsModule` ao `imports` de `AppModule`.**
- [ ] **Step 7: Commit**

```bash
git add src/events/public-events.controller.ts src/events/public-events.controller.spec.ts src/events/events.module.ts src/app.module.ts test
git commit -m "feat(events): expose public agenda endpoints and wire module"
```

---

## Task 6 (fase posterior): `GET /delivery-locations/check?cep=` — checagem de CEP pro site

> ➡️ **Movida para `docs/plans/2026-11-05-loja-online-v1.md` (Tarefa 2)**: o frete da loja depende dela. Os passos abaixo continuam valendo, com `zone` a mais no retorno `covered`.

> **Fase posterior — não faz parte da entrega da Agenda.** Registrado aqui porque nasceu da mesma proposta do site. Hoje o site checa no navegador: chama a BrasilAPI (`https://brasilapi.com.br/api/cep/v2/{cep}`) e compara o bairro devolvido (normalizado: minúsculo, sem acento) com a lista de `GET /delivery-locations/covered`. É uma aproximação provisória: ignora as `CepRange` curadas pela dona (que **ganham** da BrasilAPI no bot) e pode dizer "entregamos" pra um CEP que o bot recusaria, ou o contrário. Esta tarefa move a decisão pro backend, reaproveitando exatamente a lógica do bot.

**Files:**
- Modify: `src/delivery-locations/delivery-locations.service.ts` (+ `.spec.ts`)
- Modify: `src/delivery-locations/delivery-locations.module.ts`
- Modify: `src/delivery-locations/public-delivery-locations.controller.ts` (+ `.spec.ts`)
- Create: `src/delivery-locations/dto/check-cep.query.ts`
- Modify: `src/bot-engine/delivery-check.service.ts` (+ `.spec.ts`)

**Interfaces:**
- Consumes: `CepLookupService` (`src/cep-lookup`, já existe, timeout de 4s), `normalizeText` (`src/common/normalize-text.ts`), `DeliveryLocationsService.list()` (já existe).
- Produces:
  - `DeliveryLocationsService.resolveCep(cep: string): Promise<CepResolution>` com `type CepResolution = { status: 'covered'; bairro: string } | { status: 'not_covered'; bairro: string } | { status: 'unresolved' }`.
  - `GET /delivery-locations/check?cep=<cep>` → `{ status: 'covered' | 'not_covered' | 'unresolved', bairro?: string }`, público, no `PublicDeliveryLocationsController`.

O bot e o site passam a usar **a mesma função**: o `resolveLocation` privado de `DeliveryCheckService` (faixa `CepRange` local primeiro, BrasilAPI depois, comparação por `normalizeText`) se muda pra `DeliveryLocationsService.resolveCep`, e o bot chama ela. Mapeamento a partir do que o bot faz hoje: faixa local ou bairro da BrasilAPI casando com uma `DeliveryLocation` → `covered`/`not_covered` conforme `location.covered`, `bairro = regionName`; BrasilAPI resolve mas não casa → `not_covered`, `bairro` = o da BrasilAPI; CEP com tamanho ≠ 8 ou BrasilAPI sem resposta → `unresolved`.

- [ ] **Step 1: Testes de `resolveCep`** (movendo os casos que hoje cobrem `resolveLocation` em `delivery-check.service.spec.ts`):

```ts
describe('DeliveryLocationsService.resolveCep', () => {
  it('uses a seeded CepRange before calling BrasilAPI', async () => { /* cepLookup.lookup não chamado */ });
  it('reports not_covered for a CepRange whose location is not covered', async () => { /* covered: false */ });
  it('falls back to BrasilAPI and matches the bairro ignoring case and accents', async () => { /* 'Catete' vs 'CATETE' */ });
  it('reports not_covered with the BrasilAPI bairro when no location matches', async () => { /* ... */ });
  it('reports unresolved for a CEP that is not 8 digits', async () => { /* '2221' */ });
  it('reports unresolved when BrasilAPI fails or times out', async () => { /* lookup -> null */ });
});
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar `resolveCep`** em `DeliveryLocationsService`; `DeliveryLocationsModule` passa a importar `CepLookupModule`.
- [ ] **Step 4: Refatorar `DeliveryCheckService`** pra chamar `deliveryLocations.resolveCep(cep)` no lugar do `resolveLocation` privado, sem mudar comportamento. Run: `npx jest delivery-check` — os testes do bot têm que passar **sem alteração de expectativa** (só de mock, se o service mudou de lugar).
- [ ] **Step 5: Controller + DTO**

```ts
// dto/check-cep.query.ts — limpa máscara; qualquer coisa vira string, validação de formato fica no service (→ 'unresolved')
export class CheckCepQuery {
  @IsString() @Transform(({ value }) => String(value ?? '').replace(/\D/g, '')) cep: string;
}

// public-delivery-locations.controller.ts
@Get('check')
check(@Query() query: CheckCepQuery) {
  return this.service.resolveCep(query.cep);
}
```

CEP mal formatado responde 200 com `{ status: 'unresolved' }`, não 400 — o site trata um caminho só ("não conseguimos confirmar, fala com a gente no WhatsApp"), mesmo princípio de "nunca errar no público" do resto da API.

```ts
it('GET /delivery-locations/check?cep=22211-200 returns the resolution with no auth required', async () => { /* ... */ });
it('GET /delivery-locations/check?cep=abc returns { status: "unresolved" }', async () => { /* ... */ });
```

- [ ] **Step 6: Rodar e confirmar que passa** — `npx jest delivery-locations delivery-check`.
- [ ] **Step 7: Commit**

```bash
git add src/delivery-locations src/bot-engine/delivery-check.service.ts src/bot-engine/delivery-check.service.spec.ts
git commit -m "feat(delivery-locations): expose public CEP check reusing the bot resolution"
```

**Riscos a revisar nesta fase:**
- Endpoint público que dispara chamada à BrasilAPI vira proxy aberto: o projeto não tem `@nestjs/throttler` hoje. Avaliar rate limit por IP (ou `Cache-Control: public, max-age=86400` + cache em memória por CEP) antes de anunciar o checador no site.
- O timeout de 4s do `CepLookupService` foi calibrado pro webhook; serve aqui também, mas o site deve mostrar estado de carregando.
- Depois que isto estiver no ar, o site troca a chamada direta à BrasilAPI por `GET /delivery-locations/check` (tarefa do plano do frontend, não deste).

---

## Self-review (feito ao escrever este plano)

- **Cobertura do spec**: as 10 decisões mapeiam pras Tarefas 1 (model, índice `(published, endsAt)`, datas UTC), 2 (foto no Blob, decisão 8), 3 (rascunho, passado por data, `null` com significado, slug estável/reservado, preço `number | null`), 4 (admin multipart, sem `GET /:id`), 5 (público, vazio não é erro, passado continua acessível). A troca Destaques → Agenda no frontend (decisão 1) é registrada, não executada aqui. Item 5 da proposta (checagem de CEP) está isolado na Tarefa 6, marcada como fase posterior.
- **Consistência de tipos**: `SiteEvent`/`EventAdmin` definidos uma vez (Tarefa 3), iguais ao contrato do topo e a `src/features/site/types/event.ts` no frontend; `CepResolution` definido uma vez (Tarefa 6) e usado pelo bot e pelo controller.
- **Review Focus**: rascunho (Tarefa 3 `findPublishedBySlug`/`listUpcoming`, Tarefa 5), passado (Tarefa 3 `listUpcoming`/`findPublishedBySlug`), "agora" por requisição (Tarefa 3), em andamento (filtro por `endsAt`, Tarefa 3), colisão de rota (Tarefa 4 sem `GET /:id`, Tarefa 5 ordem + e2e, slug reservado na Tarefa 3), datas invertidas (Tarefa 3 create/update), voltar pra `null` (Tarefa 3 DTO + teste), Decimal→number (Tarefa 3), upload inválido/foto órfã (Tarefas 3 e 4) — todos com teste na tarefa dona.
- **Dependência**: Tarefas 2 e 3 dependem de `src/common/slug.ts` e `BlobStorageService` do plano do catálogo; se o catálogo ainda não foi implementado, as Tarefas 2 e 3 de lá vêm antes da Tarefa 1 daqui.
