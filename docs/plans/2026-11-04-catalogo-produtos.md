# Catálogo de produtos — plano de implementação (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar à Daverdinha um cadastro de produtos de verdade (nome, fotos, preço, categoria) via admin, servido ao site público por endpoints novos — hoje não existe nenhum model de produto no banco; `Order`/`OrderItem` só guardam o que vem do catálogo do WhatsApp (`catalogId`/`productRetailerId`), sem relação com isto.

**Architecture:** dois models novos no Postgres (`ProductCategory`, `Product`), dois módulos NestJS seguindo exatamente o padrão já usado por `categories`/`menu-items`/`delivery-locations` (service + controller admin protegido por `ClerkAuthGuard` + DTOs + testes colocados em `src/`), e um serviço novo de upload de imagem pro Vercel Blob — infra já prevista em `ROTEIRO-IMPLEMENTACAO.md` (Fase 3) pros "Destaques do Hero" e nunca construída; este plano a constrói e a Destaques herda depois. Imagem do produto **não** usa o R2 que já existe: R2 foi escolhido para mídia privada do WhatsApp (URL pré-assinada, egress grátis); foto de produto é pública, de baixo volume, e o `next.config.ts` do site **já** tem `*.public.blob.vercel-storage.com` liberado em `images.remotePatterns` — ou seja, Blob já era o destino assumido.

**Tech Stack:** NestJS 11, Prisma (Postgres), `@vercel/blob` (novo), `@nestjs/platform-express` (`FilesInterceptor`, já instalado), class-validator/class-transformer (já em uso).

**Spec:** não existe um spec separado — as decisões de produto (preço público, cadastro no admin em vez de catálogo do WhatsApp, categorias obrigatórias, página `/produtos` além do carrossel) foram fechadas em conversa com o usuário em 2026-11-04 e estão resumidas na seção "Decisões já tomadas" abaixo, no mesmo formato que `docs/plans/2026-09-22-image-handling.md` já usa neste repo.

## Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | **Cadastro no admin**, não no catálogo do WhatsApp nem em arquivo estático — a cliente edita sozinha, sem deploy. |
| 2 | **Preço é público**, sempre mostrado (não é opcional por produto). |
| 3 | **Categoria é obrigatória** por produto (reaproveita a ideia original de "Vasos", "Mudas" etc., agora como entidade própria — **não** é o `Category` que já existe hoje, que etiqueta conversas do WhatsApp no admin; nome propositalmente diferente, `ProductCategory`, pra não confundir as duas telas do admin). |
| 4 | **Sem flag de "destaque".** O carrossel da home e a futura página `/produtos` (plano do frontend) leem o mesmo endpoint, ordenado pelo campo `order`; não existe um subconjunto "destaques" separado — simplicidade mantida enquanto o catálogo for pequeno. |
| 5 | **Imagens como array de URLs** (`Product.images: String[]`), não uma tabela `ProductImage` à parte — a primeira é a capa. Evita CRUD de sub-recurso para um caso que não precisa de metadado por imagem. |
| 6 | **Catálogo vazio não é erro.** Com zero produtos cadastrados (o caso de hoje), os endpoints públicos devolvem lista vazia — mesmo padrão conservador que `delivery-locations/covered` já segue. |
| 7 | **Storage: Vercel Blob**, não R2 (ver Architecture acima). |

## Global Constraints

- **Migration única**: o projeto squasha o histórico Prisma num único `_init` (ver `docs/plans/2026-09-22-image-handling.md`, "Restrições do projeto"). Ao mexer em `schema.prisma`, apague `prisma/migrations/` e regenere uma migration única.
- **Vercel serverless**: sem disco persistente, sem processo em background — upload de imagem tem que acontecer inteiro dentro da requisição, buffer em memória (igual ao padrão já usado em `media-storage.service.ts` pro R2).
- Testes ficam ao lado do arquivo testado, dentro de `src/` (`rootDir: 'src'`).
- Toda rota admin usa `@UseGuards(ClerkAuthGuard)`; toda rota pública fica num **controller separado**, sem guard — mesmo padrão de `PublicDeliveryLocationsController` (rota pública é um fato estrutural, não um decorator que falta notar).
- `ValidationPipe({ whitelist: true, transform: true })` já é global (`bootstrap.ts`) — DTOs não precisam reconfigurar isso.

## Review Focus

- **Catálogo vazio**: `GET /products/active` com zero produtos devolve `[]` com 200, nunca erro.
- **Slug colidindo**: dois produtos com nome igual ou muito parecido (ex: "Vaso P" cadastrado duas vezes) não pode gerar 500 por violação de unicidade — o slug tem que resolver a colisão sozinho.
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
  id        String    @id @default(uuid())
  name      String    @unique
  order     Int       @default(0)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  products  Product[]

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
  @@map("products")
}
```

Sem `onDelete` explícito em `category` → Prisma/Postgres usa `RESTRICT` por padrão num relacionamento obrigatório: apagar uma `ProductCategory` com produtos estoura `P2003`, que a Tarefa 4 traduz pra 409 (ver Review Focus).

- [ ] **Step 1: Adicionar os dois models ao `schema.prisma`**, exatamente como acima.
- [ ] **Step 2: Apagar `prisma/migrations/` e regenerar a migration única**

Run: `rm -rf prisma/migrations && npx prisma migrate dev --name init`
Expected: uma única pasta nova em `prisma/migrations/`, aplicada num Postgres local de pé (ver pré-requisito igual ao de `docs/plans/2026-09-22-image-handling.md`), `prisma generate` rodando sem erro.

- [ ] **Step 3: Rodar o seed existente para confirmar que nada quebrou**

Run: `npx prisma db seed`
Expected: termina sem erro (o seed não popula produtos — catálogo nasce vazio, decisão 6).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add ProductCategory and Product models"
```

---

## Task 2: `slugify` — geração determinística de slug

**Files:**
- Create: `src/products/slug.ts`
- Test: `src/products/slug.spec.ts`

**Interfaces:**
- Produces: `slugify(name: string): string` — função pura, sem acento, minúscula, hífens, sem caracteres especiais. `src/products/products.service.ts` (Tarefa 5) a usa pra gerar o slug base antes de checar unicidade no banco.

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
```

- [ ] **Step 2: Rodar e confirmar que falha** — `npx jest slug.spec.ts`; esperado: `slugify is not defined`.
- [ ] **Step 3: Implementar `slugify(name: string): string` em `src/products/slug.ts`** — normalizar unicode (`NFD` + remover diacríticos), minúsculo, substituir qualquer sequência de não-alfanuméricos por um único hífen, aparar hífen das pontas.
- [ ] **Step 4: Rodar e confirmar que passa** — `npx jest slug.spec.ts`.
- [ ] **Step 5: Commit**

```bash
git add src/products/slug.ts src/products/slug.spec.ts
git commit -m "feat(products): add slugify helper"
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
- Produces: `BlobStorageService.uploadProductImage(buffer: Buffer, mimeType: string): Promise<string>` (devolve a URL pública) e `BlobStorageService.deleteProductImage(url: string): Promise<void>` — a Tarefa 5 (`ProductsService`) usa os dois. `BlobStorageModule` exporta `BlobStorageService`.

Módulo deliberadamente separado de `MediaStorageModule` (R2): providers distintos pra um caso de uso distinto (privado/assinado vs. público), igual a decisão já registrada no plano de imagem do WhatsApp.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install @vercel/blob`

- [ ] **Step 2: Documentar a variável de ambiente**

Adicionar em `.env.example`:
```
BLOB_READ_WRITE_TOKEN="xxx"
```
(Provisionamento real: `vercel integration add blob --yes` + `vercel env pull --yes`, já descrito em `ROTEIRO-IMPLEMENTACAO.md` Fase 3 — não repetir aqui, só confirmar que a env existe quando for rodar contra Blob de verdade.)

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

## Task 4: `ProductCategoriesModule` — CRUD admin

**Files:**
- Create: `src/product-categories/product-categories.service.ts` (+ `.spec.ts`)
- Create: `src/product-categories/product-categories.controller.ts` (+ `.spec.ts`)
- Create: `src/product-categories/product-categories.module.ts`
- Create: `src/product-categories/dto/create-product-category.dto.ts`, `dto/update-product-category.dto.ts`

**Interfaces:**
- Consumes: `ProductCategory` (Tarefa 1), `ClerkAuthGuard`/`ClerkAuthModule` (já existem em `src/common/auth`).
- Produces: `ProductCategoriesService.list()`, `.create(dto)`, `.update(id, dto)`, `.remove(id)` — a Tarefa 5 usa `list()`/um `findOne`-equivalente só pra validar `categoryId` recebido num produto (ou confia na FK do Postgres e trata o erro, ver Step 4 abaixo).

Mesmo molde de `src/categories/*` (ver código existente), **sem** o campo `color` e **sem** paginação — poucas categorias, lista inteira de uma vez, ordenada por `order` depois `name`.

- [ ] **Step 1: DTOs**

```ts
// create-product-category.dto.ts
export class CreateProductCategoryDto {
  @IsString() @IsNotEmpty() name: string;
  @IsInt() @IsOptional() @Type(() => Number) order?: number;
}
// update-product-category.dto.ts
export class UpdateProductCategoryDto extends PartialType(CreateProductCategoryDto) {}
```

- [ ] **Step 2: Testes do service**

```ts
describe('ProductCategoriesService', () => {
  it('lists ordered by order then name', async () => { /* ... */ });
  it('creates a category', async () => { /* ... */ });
  it('rejects a duplicate name with ConflictException', async () => { /* mock P2002 */ });
  it('blocks deleting a category that still has products, with ConflictException', async () => { /* mock P2003 */ });
});
```

- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar `ProductCategoriesService`** — `list()` com `orderBy: [{ order: 'asc' }, { name: 'asc' }]`; `remove()` captura `error.code === 'P2003'` e relança `ConflictException('Não é possível excluir uma categoria com produtos cadastrados.')`, mesma forma que `mapDuplicateNameError` em `CategoriesService` captura `P2002`.
- [ ] **Step 5: Controller + testes** — espelha `src/categories/categories.controller.ts` 1:1 (rotas `GET /product-categories`, `POST`, `PATCH /:id`, `DELETE /:id`, todas com `@UseGuards(ClerkAuthGuard)`), trocando só o nome do recurso.
- [ ] **Step 6: Módulo** — `imports: [ClerkAuthModule]`, `controllers: [ProductCategoriesController]`, `providers: [ProductCategoriesService]`, `exports: [ProductCategoriesService]`.
- [ ] **Step 7: Rodar os testes e confirmar que passam.**
- [ ] **Step 8: Commit**

```bash
git add src/product-categories
git commit -m "feat(product-categories): add admin CRUD"
```

---

## Task 5: `ProductsService` — regras de negócio

**Files:**
- Create: `src/products/products.service.ts`
- Test: `src/products/products.service.spec.ts`
- Create: `src/products/dto/create-product.dto.ts`, `dto/update-product.dto.ts`

**Interfaces:**
- Consumes: `slugify` (Tarefa 2), `BlobStorageService` (Tarefa 3), `Product`/`ProductCategory` (Tarefa 1).
- Produces: `ProductsService.list(query: PaginationQueryDto): Promise<Paginated<ProductAdmin>>`, `.findOne(id): Promise<ProductAdmin>`, `.create(dto: CreateProductDto, files: Express.Multer.File[]): Promise<ProductAdmin>`, `.update(id, dto: UpdateProductDto, files?: Express.Multer.File[]): Promise<ProductAdmin>`, `.remove(id): Promise<void>`, `.listActive(): Promise<ProductPublic[]>`, `.findActiveBySlug(slug): Promise<ProductPublic | null>` — Tarefas 6 e 7 chamam esses métodos; nenhuma outra tarefa define o shape de `ProductAdmin`/`ProductPublic`, então os campos abaixo são o contrato final.

```ts
// o que toda resposta devolve — `price` SEMPRE number, nunca o Decimal cru (ver Review Focus)
interface ProductPublic {
  id: string; name: string; slug: string; description: string;
  price: number; images: string[];
  category: { id: string; name: string };
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

  describe('remove', () => {
    it('deletes every stored image via BlobStorageService before removing the row', async () => { /* ... */ });
  });

  describe('listActive', () => {
    it('returns [] when there are no active products', async () => { /* Prisma mock -> [] */ });
    it('only returns active products, ordered by order', async () => { /* ... */ });
  });

  describe('findActiveBySlug', () => {
    it('returns null for a missing or inactive slug', async () => { /* ... */ });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha.**
- [ ] **Step 4: Implementar `ProductsService`**
  - `create`: gera slug base com `slugify(dto.name)`; se colidir (`findUnique` ou capturando `P2002`), tenta `${base}-2`, `${base}-3`... até achar livre; sobe cada arquivo com `blobStorage.uploadProductImage`, salva `images` na ordem recebida; converte `price` pro `Decimal` do Prisma na escrita e de volta pra `number` (`.toNumber()`) em toda leitura — escrever esse mapeamento **uma vez** (ex: função privada `toProductResponse(row)`), usada por todos os métodos de leitura.
  - `update`: se `files` vier não-vazio, substitui a lista inteira de imagens (apaga as antigas via `deleteProductImage`, sobe as novas) — sem edição parcial de imagem individual nesta versão.
  - `remove`: apaga as imagens no Blob primeiro, depois a linha.
  - `listActive`/`findActiveBySlug`: `where: { active: true }`, `include: { category: { select: { id: true, name: true } } }`, `orderBy: { order: 'asc' }`.
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
- Produces: `GET /products/active`, `GET /products/active/:slug` — **sem guard**, contrato público que o plano do frontend (`daverdinha`) consome via `getActiveProducts()`/`getActiveProductBySlug()`.

- [ ] **Step 1: Testes**

```ts
describe('PublicProductsController', () => {
  it('GET /products/active returns [] with no auth required, even with zero products', async () => { /* ... */ });
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
  listActive() { return this.service.listActive(); }

  @Get('active/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const product = await this.service.findActiveBySlug(slug);
    if (!product) throw new NotFoundException();
    return product;
  }
}
```

- [ ] **Step 4: `ProductsModule`** — registra o controller público **antes** do admin, mesmo motivo de `DeliveryLocationsModule`:

```ts
@Module({
  imports: [ClerkAuthModule],
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

- **Cobertura do spec**: as 7 decisões da tabela acima mapeiam 1:1 pras Tarefas 1 (categoria/produto), 5 (preço público, sem flag destaque, imagens como array), 4 (categoria obrigatória + bloqueio de exclusão), 3/7 (vazio não é erro), 7 (Blob). Nada ficou de fora.
- **Consistência de tipos**: `ProductPublic`/`ProductAdmin` definidos uma única vez (Tarefa 5) e só referenciados depois (Tarefas 6/7) — nenhum nome de campo diverge.
- **Review Focus**: as 5 entradas têm teste explícito numa tarefa (vazio → Tarefa 7 Step 1; slug colidindo → Tarefa 5 Step 2; exclusão de categoria com produto → Tarefa 4 Step 2; upload inválido → Tarefa 6 Step 1; Decimal→number → Tarefa 5 Step 2).
