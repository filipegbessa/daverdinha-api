# Conversation Categories (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the attendant tag conversations with one or more categories (e.g. "bingo", "fechou compra"), managed through a full CRUD, with categories deletable even while attached to conversations.

**Architecture:** A `Category` model plus a `ConversationCategory` many-to-many join table (composite primary key, `onDelete: Cascade` on both foreign keys). Deleting a category cascades the join rows away at the database level — no application-level "in use" guard, matching the project owner's explicit call. A new `CategoriesModule` owns the CRUD; `ConversationsController`/`ConversationsService` gain two small attach/detach routes and include the flattened category list on both `list()` and `getWithMessages()`, following the exact pattern already used to flatten `unread` out of the last message.

**Tech Stack:** NestJS 11, Prisma 5, Jest.

**Spec:** No separate spec doc — requirements were settled in conversation with the project owner and are recorded here as constraints.

## Global Constraints

- **Single migration file convention:** this project squashes its Prisma migration history into one `*_init` file. When Task 1 changes `schema.prisma`, delete the existing migration folder and regenerate a single fresh one.
- **No commit trailers:** no `Co-Authored-By:` / `Claude-Session:` line in any commit message.
- **Stage files by name:** `git add <file> <file>`, never `git add -A` or `git add .`.
- **Delete-cascades-silently decision:** deleting a `Category` must succeed even when conversations reference it — rely entirely on `onDelete: Cascade` on `ConversationCategory.categoryId`, do not add a check that blocks or warns from the backend. The warning-with-a-count UX lives entirely in the frontend (it fetches the count from this plan's Task 2 list endpoint before ever calling delete).
- **Fixed color palette:** a category's `color` is one of exactly 8 literal hex strings, validated server-side with `@IsIn(CATEGORY_COLORS)` — not arbitrary hex. The palette (harmonizes with the existing Tailwind colors in `daverdinha/tailwind.config.ts` — moss `#185928` and berry `#7a3247` are reused, the rest are new):

  ```typescript
  export const CATEGORY_COLORS = [
    '#185928', // moss (reused from the site's brand palette)
    '#7a3247', // berry (reused from the site's brand palette)
    '#a15c38', // clay
    '#b8862c', // mustard
    '#2c6e6b', // teal
    '#5b3a6b', // plum
    '#3a5a7a', // slate
    '#8a7f4f', // olive
  ] as const;
  ```

- **Duplicate name is a 409, not a 500:** `Category.name` is unique. Creating or renaming to a name already in use must surface as a `ConflictException` with a readable message, not Prisma's raw `P2002` error — this is an expected, everyday mistake (the attendant typing "bingo" twice), not an edge case to skip.
- `ClerkAuthGuard` (`src/common/auth/clerk-auth.guard.ts`) guards every route in this plan the same way it guards `MenuItemsController`/`ConversationsController` today — `@UseGuards(ClerkAuthGuard)` at the controller level, nothing route-specific.
- `PrismaService` is `@Global()` — injectable anywhere without importing `PrismaModule`.
- Jest config has `rootDir: 'src'`; tests live next to the file they test as `*.spec.ts`.

---

## Task 1: `Category` + `ConversationCategory` Prisma models

**Files:**
- Modify: `prisma/schema.prisma`
- Migration: delete `prisma/migrations/<existing>_init/`, regenerate

**Interfaces:**
- Produces: Prisma models `Category` (`id`, `name` unique, `color`, `createdAt`, back-relation `conversations: ConversationCategory[]`) and `ConversationCategory` (composite id `[conversationId, categoryId]`, both FKs `onDelete: Cascade`). `Conversation` gains a `categories: ConversationCategory[]` relation field. Prisma client generates the compound-unique input name `conversationId_categoryId` for `ConversationCategory` (from the `@@id` field order) — Task 3 uses that exact name.

- [ ] **Step 1: Add the models to `schema.prisma`**

Add near the end of `prisma/schema.prisma` (after the `OrderItem`/`PushSubscription` models, whichever is last):

```prisma
model Category {
  id            String                 @id @default(uuid())
  name          String                 @unique
  color         String
  createdAt     DateTime               @default(now()) @map("created_at")
  conversations ConversationCategory[]

  @@map("categories")
}

model ConversationCategory {
  conversationId String       @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  categoryId     String       @map("category_id")
  category       Category     @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now()) @map("created_at")

  @@id([conversationId, categoryId])
  @@map("conversation_categories")
}
```

Add the back-relation to the existing `Conversation` model — find this block:

```prisma
  createdAt                DateTime           @default(now()) @map("created_at")
  updatedAt                DateTime           @updatedAt @map("updated_at")
  messages                 Message[]
  orders                   Order[]

  @@map("conversations")
}
```

and change it to:

```prisma
  createdAt                DateTime           @default(now()) @map("created_at")
  updatedAt                DateTime           @updatedAt @map("updated_at")
  messages                 Message[]
  orders                   Order[]
  categories               ConversationCategory[]

  @@map("conversations")
}
```

- [ ] **Step 2: Format and validate**

```bash
npx prisma format
```

Expected: no errors, the file is reformatted with aligned columns.

- [ ] **Step 3: Regenerate the squashed migration**

```bash
docker exec daverdinha-postgres psql -U daverdinha -d da_verdinha -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
rm -rf prisma/migrations/*_init
npx prisma migrate dev --name init
```

Expected: a new `prisma/migrations/<timestamp>_init/migration.sql` is created and applied; output ends with "Your database is now in sync with your schema."

- [ ] **Step 4: Reseed local data**

```bash
npx prisma db seed
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Category and ConversationCategory models"
```

**Production migration (do this when the whole feature is ready to ship, not now):**

```bash
npx prisma migrate diff --from-url "$PROD_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

This emits additive `CREATE TABLE "categories" (...)` and `CREATE TABLE "conversation_categories" (...)` statements — no `DROP`, no data risk. Hand that SQL to the project owner to run manually (this project's auto-mode permission classifier blocks destructive-looking prod DB commands even for additive DDL), then reconcile `_prisma_migrations`: delete the stale migration-name rows and run `npx prisma migrate resolve --applied <new_migration_name>`.

---

## Task 2: `CategoriesModule` — CRUD with conversation counts

**Files:**
- Create: `src/categories/category-colors.ts`
- Create: `src/categories/dto/create-category.dto.ts`
- Create: `src/categories/dto/update-category.dto.ts`
- Create: `src/categories/categories.service.ts`
- Create: `src/categories/categories.service.spec.ts`
- Create: `src/categories/categories.controller.ts`
- Create: `src/categories/categories.controller.spec.ts`
- Create: `src/categories/categories.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (global), `ClerkAuthGuard`.
- Produces: `CategoriesService` with `list(): Promise<Array<{ id: string; name: string; color: string; createdAt: Date; conversationCount: number }>>`, `create(dto: CreateCategoryDto)`, `update(id: string, dto: UpdateCategoryDto)`, `remove(id: string): Promise<void>`. HTTP routes: `GET /categories`, `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id`.

- [ ] **Step 1: Define the color palette**

`src/categories/category-colors.ts`:

```typescript
export const CATEGORY_COLORS = [
  '#185928',
  '#7a3247',
  '#a15c38',
  '#b8862c',
  '#2c6e6b',
  '#5b3a6b',
  '#3a5a7a',
  '#8a7f4f',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];
```

- [ ] **Step 2: Write the DTOs**

`src/categories/dto/create-category.dto.ts`:

```typescript
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { CATEGORY_COLORS } from '../category-colors';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(CATEGORY_COLORS)
  color: string;
}
```

`src/categories/dto/update-category.dto.ts`:

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
```

- [ ] **Step 3: Write the failing service test**

`src/categories/categories.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: { category: any };

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  it('list() flattens the conversation count out of Prisma\'s _count wrapper', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat1', name: 'Bingo', color: '#185928', createdAt: new Date('2026-01-01'), _count: { conversations: 3 } },
      { id: 'cat2', name: 'Fechou compra', color: '#7a3247', createdAt: new Date('2026-01-02'), _count: { conversations: 0 } },
    ]);

    const result = await service.list();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: { _count: { select: { conversations: true } } },
    });
    expect(result).toEqual([
      { id: 'cat1', name: 'Bingo', color: '#185928', createdAt: new Date('2026-01-01'), conversationCount: 3 },
      { id: 'cat2', name: 'Fechou compra', color: '#7a3247', createdAt: new Date('2026-01-02'), conversationCount: 0 },
    ]);
  });

  it('create() forwards the dto to Prisma', async () => {
    prisma.category.create.mockResolvedValue({ id: 'cat1', name: 'Bingo', color: '#185928' });

    await service.create({ name: 'Bingo', color: '#185928' });

    expect(prisma.category.create).toHaveBeenCalledWith({ data: { name: 'Bingo', color: '#185928' } });
  });

  it('create() raises a friendly ConflictException on a duplicate name instead of the raw Prisma error', async () => {
    prisma.category.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.create({ name: 'Bingo', color: '#185928' })).rejects.toThrow(
      new ConflictException('Já existe uma categoria com esse nome.'),
    );
  });

  it('update() forwards the dto to Prisma', async () => {
    prisma.category.update.mockResolvedValue({ id: 'cat1', name: 'Bingo!', color: '#185928' });

    await service.update('cat1', { name: 'Bingo!' });

    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat1' }, data: { name: 'Bingo!' } });
  });

  it('update() also raises a friendly ConflictException on a duplicate name', async () => {
    prisma.category.update.mockRejectedValue({ code: 'P2002' });

    await expect(service.update('cat1', { name: 'Fechou compra' })).rejects.toThrow(
      new ConflictException('Já existe uma categoria com esse nome.'),
    );
  });

  it('remove() deletes by id, relying on cascade for attached conversations', async () => {
    prisma.category.delete.mockResolvedValue({ id: 'cat1' });

    await service.remove('cat1');

    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'cat1' } });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
npx jest src/categories/categories.service.spec.ts
```

Expected: FAIL — `Cannot find module './categories.service'`.

- [ ] **Step 5: Implement the service**

`src/categories/categories.service.ts`:

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { conversations: true } } },
    });
    return categories.map(({ _count, ...category }) => ({
      ...category,
      conversationCount: _count.conversations,
    }));
  }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  private mapDuplicateNameError(error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      return new ConflictException('Já existe uma categoria com esse nome.');
    }
    return error;
  }
}
```

- [ ] **Step 6: Run it to verify it passes**

```bash
npx jest src/categories/categories.service.spec.ts
```

Expected: PASS (6 tests).

- [ ] **Step 7: Write the failing controller test**

`src/categories/categories.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: { list: jest.Mock; create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    service = { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }],
    }).compile();

    controller = moduleRef.get(CategoriesController);
  });

  it('list() forwards to the service', () => {
    controller.list();
    expect(service.list).toHaveBeenCalled();
  });

  it('create() forwards the dto', () => {
    const dto = { name: 'Bingo', color: '#185928' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update() forwards the id and dto', () => {
    const dto = { name: 'Bingo!' };
    controller.update('cat1', dto);
    expect(service.update).toHaveBeenCalledWith('cat1', dto);
  });

  it('remove() forwards the id', () => {
    controller.remove('cat1');
    expect(service.remove).toHaveBeenCalledWith('cat1');
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

```bash
npx jest src/categories/categories.controller.spec.ts
```

Expected: FAIL — `Cannot find module './categories.controller'`.

- [ ] **Step 9: Implement the controller**

`src/categories/categories.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
@UseGuards(ClerkAuthGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 10: Run it to verify it passes**

```bash
npx jest src/categories/categories.controller.spec.ts
```

Expected: PASS (4 tests).

- [ ] **Step 11: Wire the module**

`src/categories/categories.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [CategoriesService],
  controllers: [CategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

Add it to `src/app.module.ts`'s `imports` array and import it at the top:

```typescript
import { CategoriesModule } from './categories/categories.module';
```

- [ ] **Step 12: Full test run**

```bash
npx jest
npx tsc --noEmit
```

- [ ] **Step 13: Commit**

```bash
git add src/categories src/app.module.ts
git commit -m "feat: add categories CRUD with conversation counts"
```

---

## Task 3: Attach/detach categories on a conversation

**Files:**
- Modify: `src/conversations/conversations.service.ts`
- Modify: `src/conversations/conversations.service.spec.ts`
- Modify: `src/conversations/conversations.controller.ts`
- Modify: `src/conversations/conversations.controller.spec.ts` (create if it doesn't exist yet)

**Interfaces:**
- Consumes: `ConversationCategory` model (Task 1) — `prisma.conversationCategory.upsert`/`deleteMany`, keyed by the compound unique input `conversationId_categoryId`.
- Produces: `ConversationsService.addCategory(conversationId: string, categoryId: string): Promise<void>`, `removeCategory(conversationId: string, categoryId: string): Promise<void>`. `list()` and `getWithMessages(id)` now return a flattened `categories: Category[]` field on every conversation. HTTP routes: `POST /conversations/:id/categories/:categoryId`, `DELETE /conversations/:id/categories/:categoryId`.

- [ ] **Step 1: Check whether `webhook.controller.spec.ts`-style coverage already exists for `ConversationsController`**

```bash
ls src/conversations/*.spec.ts
```

If `conversations.controller.spec.ts` doesn't exist, Step 6 below creates it from scratch (following the same direct-method-call testing style as `categories.controller.spec.ts` in Task 2). If it already exists, add the two new tests from Step 6 into it instead of creating a new file.

- [ ] **Step 2: Update the failing service tests for `list()` and `getWithMessages()`**

Open `src/conversations/conversations.service.spec.ts`. Find the `list()` test(s) and the `getWithMessages()` test, and update them to also cover categories — add these two tests (keep the existing ones, this project's `list()`/`getWithMessages()` tests were written against a `messages`-only include before categories existed):

```typescript
  it('list() flattens each conversation\'s categories out of the join-table include', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: '1',
        phone: '5521999999999',
        messages: [{ direction: 'inbound' }],
        categories: [{ category: { id: 'cat1', name: 'Bingo', color: '#185928' } }],
      },
    ]);

    const result = await service.list();

    expect(prisma.conversation.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        categories: { include: { category: true } },
      },
    });
    expect(result).toEqual([
      {
        id: '1',
        phone: '5521999999999',
        unread: true,
        categories: [{ id: 'cat1', name: 'Bingo', color: '#185928' }],
      },
    ]);
  });

  it('getWithMessages() flattens categories the same way', async () => {
    const conversation = {
      id: '1',
      messages: [],
      categories: [{ category: { id: 'cat1', name: 'Bingo', color: '#185928' } }],
    };
    prisma.conversation.findUnique.mockResolvedValue(conversation);

    const result = await service.getWithMessages('1');

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { order: { include: { items: true } } } },
        categories: { include: { category: true } },
      },
    });
    expect(result).toEqual({
      id: '1',
      messages: [],
      categories: [{ id: 'cat1', name: 'Bingo', color: '#185928' }],
    });
  });
```

This plan does not repeat the existing `list()`/`getWithMessages()` tests written for `messages` alone (those already exist in the file and must keep passing unmodified except for the `include` object growing the extra `categories` key — the assertions above already reflect the grown `include`, so update any pre-existing test that asserts the old, narrower `include` object to match).

- [ ] **Step 3: Run it to verify the new tests fail**

```bash
npx jest src/conversations/conversations.service.spec.ts
```

Expected: FAIL — `service.list is not returning categories` / the `include` assertion mismatches.

- [ ] **Step 4: Update the service**

In `src/conversations/conversations.service.ts`, replace `list()` and `getWithMessages()`:

```typescript
  async list() {
    const conversations = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        categories: { include: { category: true } },
      },
    });
    return conversations.map(({ messages, categories, ...conversation }) => ({
      ...conversation,
      unread: messages[0]?.direction === 'inbound',
      categories: categories.map((c) => c.category),
    }));
  }

  async getWithMessages(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { order: { include: { items: true } } } },
        categories: { include: { category: true } },
      },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversa ${id} não encontrada`);
    }
    const { categories, ...rest } = conversation;
    return { ...rest, categories: categories.map((c) => c.category) };
  }
```

Add these two new methods anywhere else in the class (e.g. right after `getWithMessages`):

```typescript
  async addCategory(conversationId: string, categoryId: string): Promise<void> {
    await this.prisma.conversationCategory.upsert({
      where: { conversationId_categoryId: { conversationId, categoryId } },
      update: {},
      create: { conversationId, categoryId },
    });
  }

  async removeCategory(conversationId: string, categoryId: string): Promise<void> {
    await this.prisma.conversationCategory.deleteMany({ where: { conversationId, categoryId } });
  }
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx jest src/conversations/conversations.service.spec.ts
```

Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 6: Write/add the failing controller tests**

Add to `src/conversations/conversations.controller.spec.ts` (create the file with this content if it doesn't already exist, following the direct-method-call style used in `categories.controller.spec.ts`):

```typescript
import { Test } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: { addCategory: jest.Mock; removeCategory: jest.Mock };

  beforeEach(async () => {
    service = { addCategory: jest.fn(), removeCategory: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [{ provide: ConversationsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ConversationsController);
  });

  it('addCategory() forwards the conversation id and category id', () => {
    controller.addCategory('conv1', 'cat1');
    expect(service.addCategory).toHaveBeenCalledWith('conv1', 'cat1');
  });

  it('removeCategory() forwards the conversation id and category id', () => {
    controller.removeCategory('conv1', 'cat1');
    expect(service.removeCategory).toHaveBeenCalledWith('conv1', 'cat1');
  });
});
```

If the file already exists with other tests (e.g. for `reply`/`pause`/`reactivate`), add these two `it()` blocks inside its existing `describe('ConversationsController', ...)` block instead of creating a new file, reusing whatever `service`/`moduleRef` setup is already there — just make sure `addCategory`/`removeCategory` are added to that shared service mock object.

- [ ] **Step 7: Run it to verify it fails**

```bash
npx jest src/conversations/conversations.controller.spec.ts
```

Expected: FAIL — `controller.addCategory is not a function`.

- [ ] **Step 8: Add the routes**

In `src/conversations/conversations.controller.ts`, add two methods (anywhere in the class body, e.g. after the `pause` method):

```typescript
  @Post(':id/categories/:categoryId')
  addCategory(@Param('id') id: string, @Param('categoryId') categoryId: string) {
    return this.service.addCategory(id, categoryId);
  }

  @Delete(':id/categories/:categoryId')
  removeCategory(@Param('id') id: string, @Param('categoryId') categoryId: string) {
    return this.service.removeCategory(id, categoryId);
  }
```

Add `Delete` to the existing `@nestjs/common` import line if it isn't already imported (`conversations.controller.ts` currently imports `Body, Controller, Get, Param, Patch, Post, UseGuards` — add `Delete` to that list).

- [ ] **Step 9: Run it to verify it passes**

```bash
npx jest src/conversations/conversations.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Full test run**

```bash
npx jest
npx tsc --noEmit
```

Expected: every suite passes, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/conversations/conversations.service.ts src/conversations/conversations.service.spec.ts src/conversations/conversations.controller.ts src/conversations/conversations.controller.spec.ts
git commit -m "feat: attach/detach categories on a conversation, include them in list/detail"
```

---

## After this plan ships

Nothing changes for the attendant until the admin frontend consumes these endpoints — see the paired plan in the `daverdinha` repo (`docs/plans/2026-09-14-conversation-categories.md`), which depends on every task here being complete and deployed (it calls `GET/POST/PATCH/DELETE /categories` and the two new `/conversations/:id/categories/:categoryId` routes, none of which exist until this plan ships). Do not start it before this one is finished.
