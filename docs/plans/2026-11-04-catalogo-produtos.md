# Catálogo de produtos — plano de implementação (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Atualizado em 2026-11-04:** a proposta nova do site (aprovada pelo usuário) aninha as URLs de produto por categoria — `/produtos`, `/produtos/[categoria]`, `/produtos/[categoria]/[produto]` — e dá a cada categoria uma página própria com texto de abertura (é o que o Google lê numa página de listagem). Por isso `ProductCategory` ganhou `slug` (único, gerado do nome com a mesma resolução de colisão do slug de produto), `description` (texto da página da categoria, editado no admin) e `active`; o payload público de produto passou a trazer `category.slug`; e entrou um endpoint público novo, `GET /product-categories/active`, além do filtro `?category=<slug>` em `GET /products/active`. O `slugify` saiu de `src/products/` pra `src/common/slug.ts`, já que agora dois módulos (e a Agenda, `docs/plans/2026-11-04-agenda-eventos.md`) o usam. O frontend já está sendo implementado contra este contrato — os nomes de campo abaixo não mudam mais.

**Goal:** dar à Daverdinha um cadastro de produtos de verdade (nome, fotos, preço, categoria) via admin, servido ao site público por endpoints novos — hoje não existe nenhum model de produto no banco; `Order`/`OrderItem` só guardam o que vem do catálogo do WhatsApp (`catalogId`/`productRetailerId`), sem relação com isto.

**Architecture:** dois models novos no Postgres (`ProductCategory`, `Product`), dois módulos NestJS seguindo exatamente o padrão já usado por `categories`/`menu-items`/`delivery-locations` (service + controller admin protegido por `ClerkAuthGuard` + controller público separado + DTOs + testes colocados em `src/`), e um serviço novo de upload de imagem pro Vercel Blob — infra prevista pros antigos "Destaques do Hero" e nunca construída; este plano a constrói e a Agenda de eventos (`docs/plans/2026-11-04-agenda-eventos.md`, que substitui os Destaques) a reaproveita depois. Imagem do produto **não** usa o R2 que já existe: R2 foi escolhido para mídia privada do WhatsApp (URL pré-assinada, egress grátis); foto de produto é pública, de baixo volume, e o `next.config.ts` do site **já** tem `*.public.blob.vercel-storage.com` liberado em `images.remotePatterns` — ou seja, Blob já era o destino assumido.

**Tech Stack:** NestJS 11, Prisma (Postgres), `@vercel/blob` (novo), `@nestjs/platform-express` (`FilesInterceptor`, já instalado), class-validator/class-transformer (já em uso).

**Spec:** não existe um spec separado — as decisões de produto (preço público, cadastro no admin em vez de catálogo do WhatsApp, categorias obrigatórias, página `/produtos` além do carrossel, URLs aninhadas por categoria) foram fechadas em conversa com o usuário em 2026-11-04 e estão resumidas na seção "Decisões já tomadas" abaixo.

Contrato público (fonte da verdade pros nomes de campo, espelhado em `src/features/site/types/catalog.ts` no `daverdinha`):

```ts
// GET /product-categories/active
interface ProductCategory { id: string; name: string; slug: string; description: string }

// GET /products/active[?category=<slug>], GET /products/active/:slug
interface Product {
  id: string; name: string; slug: string; description: string;
  price: number; images: string[];
  category: { id: string; name: string; slug: string };
}
```

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Cadastro no admin**, não no catálogo do WhatsApp nem em arquivo estático — a cliente edita sozinha, sem deploy. |
| 2 | **Preço é público**, sempre mostrado (não é opcional por produto). |
| 3 | **Categoria é obrigatória** por produto (reaproveita a ideia original de "Vasos", "Mudas" etc., agora como entidade própria — **não** é o `Category` que já existe hoje, que etiqueta conversas do WhatsApp no admin; nome propositalmente diferente, `ProductCategory`, pra não confundir as duas telas do admin). |
| 4 | **Sem flag de "destaque".** O carrossel da home, `/produtos` e as páginas de categoria (plano do frontend) leem o mesmo endpoint, ordenado pelo campo `order`; não existe um subconjunto "destaques" separado — simplicidade mantida enquanto o catálogo for pequeno. |
| 5 | **Imagens como array de URLs** (`Product.images: String[]`), não uma tabela `ProductImage` à parte — a primeira é a capa. Evita CRUD de sub-recurso para um caso que não precisa de metadado por imagem. |
| 6 | **Catálogo vazio não é erro.** Com zero produtos cadastrados (o caso de hoje), os endpoints públicos devolvem lista vazia — mesmo padrão conservador que `delivery-locations/covered` já segue. Vale também pro filtro por categoria: `?category=` com slug inexistente devolve `[]`, não 404. |
| 7 | **Storage: Vercel Blob**, não R2 (ver Architecture acima). |
| 8 | **URLs aninhadas no site, slug de produto continua global.** O site usa `/produtos/[categoria]/[produto]`, mas busca o produto **só pelo slug dele** (`GET /products/active/:slug`, inalterado); se a categoria da URL não bater com a atual do produto, o site redireciona (308). Por isso `Product.slug` continua `@unique` sozinho (não por categoria) e trocar um produto de categoria não quebra link antigo. |
| 9 | **`ProductCategory` ganha `slug`, `description` e `active`.** `slug` é gerado do nome na criação, com a mesma resolução de colisão do produto (`-2`, `-3`…). `description` é o texto de abertura da página da categoria (SEO), editado no admin, `""` por padrão. `active` deixa a cliente tirar uma categoria do ar sem apagar. |
| 10 | **Slug não muda ao renomear** (produto ou categoria): é gerado só no `create`. Renomear "Vasos" pra "Vasos e cachepôs" mantém `/produtos/vasos` — URL estável vale mais que URL "bonita" depois de indexada. |
| 11 | **Visibilidade pública depende da categoria também.** Produto aparece em `/products/active` só se `product.active && category.active`; categoria aparece em `/product-categories/active` só se `active` **e** com pelo menos um produto ativo — categoria vazia daria uma página sem conteúdo (o site devolve 404 e a deixa fora do sitemap). |

## Global Constraints

- **Migration única**: o projeto squasha o histórico Prisma num único `_init` (ver README, "Migration única + banco de produção com dado real"). Ao mexer em `schema.prisma`, apague `prisma/migrations/` e regenere uma migration única.
- **⚠️ Banco de produção tem dado real** (README → "Migration única + banco de produção com dado real"): a migration regenerada **nunca** vai pra produção com `migrate deploy`/`migrate reset` — isso apaga tudo. Em produção, aplicar só o delta (`prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma --script`), ler o SQL inteiro (só `CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX` esperados aqui; qualquer `DROP`/`TRUNCATE` = parar), `prisma db execute`, depois `prisma migrate resolve --applied <pasta_nova>` e `prisma migrate status`.
- **Vercel serverless**: sem disco persistente, sem processo em background — upload de imagem tem que acontecer inteiro dentro da requisição, buffer em memória (igual ao padrão já usado em `media-storage.service.ts` pro R2).
- Testes ficam ao lado do arquivo testado, dentro de `src/` (`rootDir: 'src'`).
- Toda rota admin usa `@UseGuards(ClerkAuthGuard)`; toda rota pública fica num **controller separado**, sem guard — mesmo padrão de `PublicDeliveryLocationsController` (rota pública é um fato estrutural, não um decorator que falta notar).
- `ValidationPipe({ whitelist: true, transform: true })` já é global (`bootstrap.ts`) — DTOs não precisam reconfigurar isso.

## Review Focus

- **Catálogo vazio**: `GET /products/active` e `GET /product-categories/active` com zero produtos devolvem `[]` com 200, nunca erro; `GET /products/active?category=nao-existe` também devolve `[]`.
- **Slug colidindo**: dois produtos (ou duas categorias) com nome igual ou muito parecido (ex: "Vaso P" cadastrado duas vezes; categorias "Vasos" e "Vasos!") não pode gerar 500 por violação de unicidade — o slug tem que resolver a colisão sozinho. Mesmo helper pros dois, não duas implementações.
- **Categoria sem produto ativo não vaza**: `GET /product-categories/active` não lista categoria inativa nem categoria cujos produtos estão todos inativos; `GET /products/active` não lista produto ativo de categoria inativa.
- **`category.slug` no payload**: toda leitura pública de produto traz `category: { id, name, slug }` — o site monta a URL `/produtos/[categoria]/[produto]` e decide o redirect 308 com esse campo. Sem ele, todo link de produto quebra.
- **Excluir categoria com produtos**: apagar uma `ProductCategory` que ainda tem `Product` apontando pra ela não pode estourar um erro de FK cru (P2003) — precisa de 409 com mensagem clara, igual `CategoriesService` já faz pra nome duplicado.
- **Upload de imagem inválida**: arquivo com mimetype fora da lista ou maior que o teto não pode derrubar a função serverless nem deixar lixo órfão no Blob — rejeita com 400 antes de subir qualquer coisa.
- **Preço sem perder centavo**: `Decimal` do Prisma, por padrão, serializa como **string** em JSON (tem `toJSON()` próprio) — se o serviço não converter explicitamente pra `number`, o frontend recebe `"89.90"` em vez de `89.9` e quebra a tipagem combinada entre os dois planos.

---

## Task 1: Schema — `ProductCategory` e `Product`

**Files:**
- Modify: `prisma/schema.prisma`
- Delete + regenerate: `prisma/migrations/` (migration única, ver Global Constraints)

**Interfaces:**
- Produces (pro resto do plano): os dois models abaixo, exatamente com estes nomes de campo (camelCase no client Prisma, `@map` snake_case no banco).

```prisma
model ProductCategory {
  id          String    @id @default(uuid())
  name        String    @unique
  slug        String    @unique
  description String    @default("")
  active      Boolean   @default(true)
  order       Int       @default(0)
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  products    Product[]

  @@map("product_categories")
}

model Product {
  id          String          @id @default(uuid())
  name        String
  slug        String          @unique
  description String
  price       Decimal         @db.Decimal(10, 2)
  images      String[]
  categoryId  String          @map("category_id")
  category    ProductCategory @relation(fields: [categoryId], references: [id])
  active      Boolean         @default(true)
  order       Int             @default(0)
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  @@index([active, order])
  @@index([categoryId])
  @@map("products")
}
```

Sem `onDelete` explícito em `category` → Prisma/Postgres usa `RESTRICT` por padrão num relacionamento obrigatório: apagar uma `ProductCategory` com produtos estoura `P2003`, que a Tarefa 4 traduz pra 409 (ver Review Focus). `@@index([categoryId])` atende o filtro `?category=` e a checagem "tem produto ativo" da Tarefa 4.

- [ ] **Step 1: Adicionar os dois models ao `schema.prisma`**, exatamente como acima.
- [ ] **Step 2: Apagar `prisma/migrations/` e regenerar a migration única**

Run: `rm -rf prisma/migrations && npx prisma migrate dev --name init`
Expected: uma única pasta nova em `prisma/migrations/`, aplicada num Postgres **local** de pé (`docker compose up -d`, ver README "Setup local"), `prisma generate` rodando sem erro. Produção **não** é tocada aqui — ver Global Constraints (delta revisado + `migrate resolve --applied`).

- [ ] **Step 3: Rodar o seed existente para confirmar que nada quebrou**

Run: `npx prisma db seed`
Expected: termina sem erro (o seed não popula produtos nem categorias de produto — catálogo nasce vazio, decisão 6).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add ProductCategory and Product models"
```

---

## Task 2: `slug.ts` — geração determinística de slug, com colisão

**Files:**
- Create: `src/common/slug.ts`
- Test: `src/common/slug.spec.ts`

**Interfaces:**
- Produces:
  - `slugify(name: string): string` — função pura, sem acento, minúscula, hífens, sem caracteres especiais.
  - `uniqueSlug(name: string, isTaken: (slug: string) => Promise<boolean>): Promise<string>` — devolve `slugify(name)` se livre, senão `${base}-2`, `${base}-3`… até achar um livre.
- Consumidores: `ProductCategoriesService` (Tarefa 4), `ProductsService` (Tarefa 5) e, depois, `EventsService` (`docs/plans/2026-11-04-agenda-eventos.md`). Fica em `src/common/` ao lado de `normalize-text.ts` justamente por ter mais de um dono.

- [ ] **Step 1: Escrever os testes**

```ts
describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Vaso Terracota M')).toBe('vaso-terracota-m');
  });

  it('strips accents', () => {
    expect(slugify('Suculenta Echévéria')).toBe('suculenta-echeveria');
  });

  it('drops characters that are not letters, numbers or spaces', () => {
    expect(slugify('Kit Jardinagem (iniciante)!')).toBe('kit-jardinagem-iniciante');
  });

  it('collapses repeated whitespace into one hyphen', () => {
    expect(slugify('Arranjo   Tropical')).toBe('arranjo-tropical');
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    expect(await uniqueSlug('Vasos', async () => false)).toBe('vasos');
  });

  it('appends -2, -3… until it finds a free one', async () => {
    const taken = new Set(['vasos', 'vasos-2']);
    expect(await uniqueSlug('Vasos!', async (s) => taken.has(s))).toBe('vasos-3');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha** — `npx jest slug.spec.ts`; esperado: `slugify is not defined`.
- [ ] **Step 3: Implementar em `src/common/slug.ts`** — `slugify`: normalizar unicode (`NFD` + remover diacríticos), minúsculo, substituir qualquer sequência de não-alfanuméricos por um único hífen, aparar hífen das pontas. `uniqueSlug`: laço simples chamando `isTaken`. A checagem prévia não elimina a corrida entre duas criações simultâneas — os services ainda capturam `P2002` no `slug` e tentam de novo uma vez (Tarefas 4 e 5).
- [ ] **Step 4: Rodar e confirmar que passa** — `npx jest slug.spec.ts`.
- [ ] **Step 5: Commit**

```bash
git add src/common/slug.ts src/common/slug.spec.ts
git commit -m "feat(common): add slugify and uniqueSlug helpers"
```

---

## Task 3: `BlobStorageService` — upload/exclusão de foto no Vercel Blob

**Files:**
- Create: `src/media/blob-storage.service.ts`
- Create: `src/media/blob-storage.module.ts`
- Test: `src/media/blob-storage.service.spec.ts`
- Modify: `package.json` (nova dependência), `.env.example`

**Interfaces:**
- Consumes: nada de outra tarefa.
- Produces: `BlobStorageService.uploadProductImage(buffer: Buffer, mimeType: string): Promise<string>` (devolve a URL pública) e `BlobStorageService.deleteProductImage(url: string): Promise<void>` — a Tarefa 5 (`ProductsService`) usa os dois. `BlobStorageModule` exporta `BlobStorageService`. (A Agenda acrescenta depois um `uploadEventImage` com prefixo `events/` — ver plano dela; não antecipar aqui.)

Módulo deliberadamente separado de `MediaStorageModule` (R2): providers distintos pra um caso de uso distinto (privado/assinado vs. público), igual a decisão já registrada no plano de imagem do WhatsApp.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install @vercel/blob`

- [ ] **Step 2: Documentar a variável de ambiente**

Adicionar em `.env.example`:
```
BLOB_READ_WRITE_TOKEN="xxx"
```
(Provisionamento real: `vercel integration add blob --yes` + `vercel env pull --yes`. Só confirmar que a env existe quando for rodar contra Blob de verdade.)

- [ ] **Step 3: Escrever os testes, mockando `@vercel/blob` — nunca fala com o Blob de verdade**

```ts
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }));

describe('BlobStorageService', () => {
  it('uploads the buffer and returns the public URL', async () => {
    (put as jest.Mock).mockResolvedValue({ url: 'https://abc.public.blob.vercel-storage.com/products/x.jpg' });

    const url = await service.uploadProductImage(Buffer.from('fake'), 'image/jpeg');

    expect(url).toBe('https://abc.public.blob.vercel-storage.com/products/x.jpg');
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^products\/.+\.jpg$/),
      expect.any(Buffer),
      expect.objectContaining({ access: 'public', contentType: 'image/jpeg' }),
    );
  });

  it('deletes by URL', async () => {
    await service.deleteProductImage('https://abc.public.blob.vercel-storage.com/products/x.jpg');
    expect(del).toHaveBeenCalledWith('https://abc.public.blob.vercel-storage.com/products/x.jpg');
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha.**
- [ ] **Step 5: Implementar `BlobStorageService`** — chave gerada como `products/{uuid}.{ext}`, extensão derivada de um mapa `{ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }` (mesma forma de `MIME_EXTENSIONS` em `media-storage.service.ts`, sem reaproveitar o arquivo — módulos independentes). `access: 'public'` no `put`.
- [ ] **Step 6: Criar `BlobStorageModule`** — `providers: [BlobStorageService], exports: [BlobStorageService]`.
- [ ] **Step 7: Rodar e confirmar que passa.**
- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example src/media/blob-storage.service.ts src/media/blob-storage.module.ts src/media/blob-storage.service.spec.ts
git commit -m "feat(media): add BlobStorageService for public product images"
```

---

## Task 4: `ProductCategoriesModule` — CRUD admin + lista pública

**Files:**
- Create: `src/product-categories/product-categories.service.ts` (+ `.spec.ts`)
- Create: `src/product-categories/product-categories.controller.ts` (+ `.spec.ts`)
- Create: `src/product-categories/public-product-categories.controller.ts` (+ `.spec.ts`)
- Create: `src/product-categories/product-categories.module.ts`
- Create: `src/product-categories/dto/create-product-category.dto.ts`, `dto/update-product-category.dto.ts`

**Interfaces:**
- Consumes: `ProductCategory` (Tarefa 1), `uniqueSlug` (Tarefa 2), `ClerkAuthGuard`/`ClerkAuthModule` (já existem em `src/common/auth`).
- Produces:
  - `ProductCategoriesService.list()`, `.create(dto)`, `.update(id, dto)`, `.remove(id)` — admin; devolvem `ProductCategoryAdmin = { id, name, slug, description, active, order }`.
  - `ProductCategoriesService.listActive(): Promise<ProductCategoryPublic[]>` com `ProductCategoryPublic = { id, name, slug, description }`.
  - Rota pública `GET /product-categories/active` — consumida pelo site (`getActiveProductCategories()` no plano do frontend).

Mesmo molde de `src/categories/*` (ver código existente), **sem** o campo `color` e **sem** paginação — poucas categorias, lista inteira de uma vez, ordenada por `order` depois `name`.

- [ ] **Step 1: DTOs**

```ts
// create-product-category.dto.ts
export class CreateProductCategoryDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsInt() @IsOptional() @Type(() => Number) order?: number;
}
// update-product-category.dto.ts
export class UpdateProductCategoryDto extends PartialType(CreateProductCategoryDto) {}
```

Sem `slug` no DTO: é gerado pelo service na criação e nunca editado pelo admin (decisões 9 e 10). Este recurso chega como JSON (sem upload), então `@IsBoolean()` direto basta — não precisa do `@Transform` de string que o DTO de produto usa.

- [ ] **Step 2: Testes do service**

```ts
describe('ProductCategoriesService', () => {
  it('lists ordered by order then name', async () => { /* ... */ });
  it('creates a category with a slug generated from the name', async () => {
    // create({ name: 'Vasos e Cachepôs' }) -> data.slug === 'vasos-e-cachepos'
  });
  it('appends -2 to the slug when another category already has it', async () => { /* findUnique({ slug: 'vasos' }) -> existente */ });
  it('does not touch the slug when the name is updated', async () => {
    // update(id, { name: 'Vasos grandes' }) -> data sem `slug`
  });
  it('rejects a duplicate name with ConflictException', async () => { /* mock P2002 em `name` */ });
  it('blocks deleting a category that still has products, with ConflictException', async () => { /* mock P2003 */ });

  describe('listActive', () => {
    it('returns [] when there are no categories', async () => { /* ... */ });
    it('only returns active categories that have at least one active product', async () => {
      // espera where: { active: true, products: { some: { active: true } } }
    });
    it('exposes only id, name, slug and description', async () => { /* sem active/order/createdAt */ });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar `ProductCategoriesService`**
  - `list()` com `orderBy: [{ order: 'asc' }, { name: 'asc' }]`.
  - `create()` gera `slug` com `uniqueSlug(dto.name, (s) => exists({ slug: s }))`; `P2002` em `name` → `ConflictException('Já existe uma categoria com esse nome.')`, mesma forma que `mapDuplicateNameError` em `CategoriesService` (olhar `error.meta.target` pra distinguir de `P2002` em `slug`, que é corrida — tenta gerar de novo uma vez).
  - `update()` repassa só os campos do DTO — nunca recalcula `slug`.
  - `remove()` captura `error.code === 'P2003'` e relança `ConflictException('Não é possível excluir uma categoria com produtos cadastrados.')`.
  - `listActive()`: `where: { active: true, products: { some: { active: true } } }`, `orderBy: [{ order: 'asc' }, { name: 'asc' }]`, `select: { id: true, name: true, slug: true, description: true }`.
- [ ] **Step 5: Controller admin + testes** — espelha `src/categories/categories.controller.ts` 1:1 (rotas `GET /product-categories`, `POST`, `PATCH /:id`, `DELETE /:id`, todas com `@UseGuards(ClerkAuthGuard)`), trocando só o nome do recurso.
- [ ] **Step 6: Controller público + teste**

```ts
@ApiTags('product-categories')
@Controller('product-categories')
export class PublicProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get('active')
  listActive() { return this.service.listActive(); }
}
```

```ts
it('GET /product-categories/active returns [] with no auth required, even with zero categories', async () => { /* ... */ });
```

- [ ] **Step 7: Módulo** — `imports: [ClerkAuthModule]`, `controllers: [PublicProductCategoriesController, ProductCategoriesController]` (público **antes**, mesmo motivo de `DeliveryLocationsModule`), `providers: [ProductCategoriesService]`, `exports: [ProductCategoriesService]`.
- [ ] **Step 8: Rodar os testes e confirmar que passam.**
- [ ] **Step 9: Commit**

```bash
git add src/product-categories
git commit -m "feat(product-categories): add admin CRUD and public active list"
```

---

## Task 5: `ProductsService` — regras de negócio

**Files:**
- Create: `src/products/products.service.ts`
- Test: `src/products/products.service.spec.ts`
- Create: `src/products/dto/create-product.dto.ts`, `dto/update-product.dto.ts`, `dto/list-active-products.query.ts`

**Interfaces:**
- Consumes: `uniqueSlug` (Tarefa 2), `BlobStorageService` (Tarefa 3), `Product`/`ProductCategory` (Tarefa 1).
- Produces: `ProductsService.list(query: PaginationQueryDto): Promise<Paginated<ProductAdmin>>`, `.findOne(id): Promise<ProductAdmin>`, `.create(dto: CreateProductDto, files: Express.Multer.File[]): Promise<ProductAdmin>`, `.update(id, dto: UpdateProductDto, files?: Express.Multer.File[]): Promise<ProductAdmin>`, `.remove(id): Promise<void>`, `.listActive(categorySlug?: string): Promise<ProductPublic[]>`, `.findActiveBySlug(slug): Promise<ProductPublic | null>` — Tarefas 6 e 7 chamam esses métodos; nenhuma outra tarefa define o shape de `ProductAdmin`/`ProductPublic`, então os campos abaixo são o contrato final.

```ts
// o que toda resposta devolve — `price` SEMPRE number, nunca o Decimal cru (ver Review Focus)
interface ProductPublic {
  id: string; name: string; slug: string; description: string;
  price: number; images: string[];
  category: { id: string; name: string; slug: string };
}
// ProductAdmin = ProductPublic + { active: boolean; order: number; categoryId: string }
```

- [ ] **Step 1: DTOs** — campos chegam via `multipart/form-data`, então todo número/boolean precisa de conversão explícita de string:

```ts
export class CreateProductDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() description: string;
  @Type(() => Number) @IsNumber() @Min(0) price: number;
  @IsUUID() categoryId: string;
  @IsInt() @IsOptional() @Type(() => Number) order?: number;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() active?: boolean;
}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

// query string de GET /products/active
export class ListActiveProductsQuery {
  @IsString() @IsOptional() category?: string;
}
```

`active` usa `@Transform` em vez de `@Type(() => Boolean)` de propósito: `Boolean('false')` é `true` em JS (string não-vazia) — `@Type` sozinho aceitaria qualquer string não-vazia como "ativo".

- [ ] **Step 2: Testes — catálogo e CRUD admin**

```ts
describe('ProductsService', () => {
  describe('create', () => {
    it('generates a slug from the name', async () => { /* ... */ });
    it('appends -2 when the base slug is already taken', async () => { /* duas criações com o mesmo nome */ });
    it('uploads each file via BlobStorageService and stores the returned URLs in order', async () => { /* BlobStorageService mockado */ });
    it('returns price as a number, not a Decimal/string', async () => {
      // mock do Prisma devolvendo price: new Prisma.Decimal('89.90')
      const result = await service.create(dto, []);
      expect(result.price).toBe(89.9);
      expect(typeof result.price).toBe('number');
    });
  });

  describe('update', () => {
    it('keeps the slug when the name changes', async () => { /* data sem `slug` */ });
  });

  describe('remove', () => {
    it('deletes every stored image via BlobStorageService before removing the row', async () => { /* ... */ });
  });

  describe('listActive', () => {
    it('returns [] when there are no active products', async () => { /* Prisma mock -> [] */ });
    it('only returns active products of active categories, ordered by order', async () => {
      // espera where: { active: true, category: { active: true } }
    });
    it('filters by category slug when given', async () => {
      // listActive('vasos') -> where: { active: true, category: { active: true, slug: 'vasos' } }
    });
    it('returns [] for an unknown category slug, not an error', async () => { /* ... */ });
    it('includes the category slug in every product', async () => {
      // result[0].category -> { id, name, slug }
    });
  });

  describe('findActiveBySlug', () => {
    it('returns null for a missing or inactive slug', async () => { /* ... */ });
    it('returns null when the product is active but its category is not', async () => { /* ... */ });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar `ProductsService`**
  - `create`: `slug` via `uniqueSlug(dto.name, …)` (Tarefa 2); sobe cada arquivo com `blobStorage.uploadProductImage`, salva `images` na ordem recebida; converte `price` pro `Decimal` do Prisma na escrita e de volta pra `number` (`.toNumber()`) em toda leitura — escrever esse mapeamento **uma vez** (ex: função privada `toProductResponse(row)`), usada por todos os métodos de leitura.
  - `update`: nunca recalcula `slug` (decisão 10). Se `files` vier não-vazio, substitui a lista inteira de imagens (apaga as antigas via `deleteProductImage`, sobe as novas) — sem edição parcial de imagem individual nesta versão.
  - `remove`: apaga as imagens no Blob primeiro, depois a linha.
  - `listActive(categorySlug?)`/`findActiveBySlug`: `where: { active: true, category: { active: true, ...(categorySlug && { slug: categorySlug }) } }` (o `findActiveBySlug` acrescenta `slug`), `include: { category: { select: { id: true, name: true, slug: true } } }`, `orderBy: { order: 'asc' }`.
- [ ] **Step 5: Rodar e confirmar que passa.**
- [ ] **Step 6: Commit**

```bash
git add src/products/products.service.ts src/products/products.service.spec.ts src/products/dto
git commit -m "feat(products): add ProductsService"
```

---

## Task 6: `ProductsController` — admin, multipart

**Files:**
- Create: `src/products/products.controller.ts`
- Test: `src/products/products.controller.spec.ts`

**Interfaces:**
- Consumes: `ProductsService` (Tarefa 5).
- Produces: rotas `GET /products`, `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`, todas com `@UseGuards(ClerkAuthGuard)`.

- [ ] **Step 1: Testes do controller** — mesma forma dos testes existentes em `src/categories/categories.controller.spec.ts` (service mockado, confere que cada método do controller chama o método certo do service com os argumentos certos); acrescenta um teste de rejeição de upload:

```ts
it('rejects a file that is not jpeg/png/webp with a 400', async () => {
  // dispara o fileFilter do FilesInterceptor com um mimetype fora da lista
});
it('rejects a file over 5MB with a 400', async () => { /* ... */ });
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar `ProductsController`**

```ts
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 6;
```

`POST`/`PATCH` usam `@UseInterceptors(FilesInterceptor('images', MAX_IMAGES, { limits: { fileSize: MAX_IMAGE_BYTES }, fileFilter: (req, file, cb) => cb(null, ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) }))`; body chega via `@Body() dto` (os campos de texto do multipart) e arquivos via `@UploadedFiles() files: Express.Multer.File[]`.

- [ ] **Step 4: Rodar e confirmar que passa.**
- [ ] **Step 5: Commit**

```bash
git add src/products/products.controller.ts src/products/products.controller.spec.ts
git commit -m "feat(products): add admin ProductsController"
```

---

## Task 7: `PublicProductsController` — leitura sem autenticação

**Files:**
- Create: `src/products/public-products.controller.ts`
- Test: `src/products/public-products.controller.spec.ts`
- Create: `src/products/products.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `ProductsService.listActive()`, `.findActiveBySlug()` (Tarefa 5).
- Produces: `GET /products/active[?category=<slug>]`, `GET /products/active/:slug` — **sem guard**, contrato público que o plano do frontend (`daverdinha`) consome via `getActiveProducts()`/`getActiveProductBySlug()`.

- [ ] **Step 1: Testes**

```ts
describe('PublicProductsController', () => {
  it('GET /products/active returns [] with no auth required, even with zero products', async () => { /* ... */ });
  it('GET /products/active?category=vasos passes the slug through to the service', async () => {
    // expect(service.listActive).toHaveBeenCalledWith('vasos')
  });
  it('GET /products/active/:slug returns 404 when the product does not exist or is inactive', async () => { /* NotFoundException */ });
});
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar**

```ts
@ApiTags('products')
@Controller('products')
export class PublicProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get('active')
  listActive(@Query() query: ListActiveProductsQuery) {
    return this.service.listActive(query.category);
  }

  @Get('active/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const product = await this.service.findActiveBySlug(slug);
    if (!product) throw new NotFoundException();
    return product;
  }
}
```

- [ ] **Step 4: `ProductsModule`** — registra o controller público **antes** do admin, mesmo motivo de `DeliveryLocationsModule` (aqui é obrigatório: senão `GET /products/:id` do admin captura `GET /products/active` e responde 401):

```ts
@Module({
  imports: [ClerkAuthModule, BlobStorageModule],
  providers: [ProductsService],
  controllers: [PublicProductsController, ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
```

- [ ] **Step 5: Rodar e confirmar que passa.**
- [ ] **Step 6: Ligar os módulos novos em `AppModule`** — adicionar `ProductCategoriesModule`, `ProductsModule`, `BlobStorageModule` (Tarefa 3) ao array `imports`.
- [ ] **Step 7: Commit**

```bash
git add src/products/public-products.controller.ts src/products/public-products.controller.spec.ts src/products/products.module.ts src/app.module.ts
git commit -m "feat(products): expose public product endpoints and wire modules"
```

---

## Self-review (feito ao escrever este plano)

- **Cobertura do spec**: as 11 decisões da tabela acima mapeiam pras Tarefas 1 (categoria/produto, slug/description/active na categoria), 5 (preço público, sem flag destaque, imagens como array, slug global, visibilidade dependente da categoria), 4 (categoria obrigatória + bloqueio de exclusão, slug de categoria, lista pública só com categoria que tem produto), 2/4/5 (slug estável ao renomear), 4/7 (vazio não é erro, inclusive com `?category=` desconhecido), 3 (Blob). Nada ficou de fora.
- **Consistência de tipos**: `ProductPublic`/`ProductAdmin` definidos uma única vez (Tarefa 5), `ProductCategoryPublic`/`ProductCategoryAdmin` uma única vez (Tarefa 4), e só referenciados depois — nenhum nome de campo diverge do contrato no topo nem de `src/features/site/types/catalog.ts` no frontend.
- **Review Focus**: as 7 entradas têm teste explícito numa tarefa (vazio → Tarefas 4 e 7; slug colidindo → Tarefa 2 Step 1 + Tarefas 4/5 Step 2; categoria sem produto ativo / categoria inativa → Tarefa 4 Step 2 e Tarefa 5 Step 2; `category.slug` → Tarefa 5 Step 2; exclusão de categoria com produto → Tarefa 4 Step 2; upload inválido → Tarefa 6 Step 1; Decimal→number → Tarefa 5 Step 2).
