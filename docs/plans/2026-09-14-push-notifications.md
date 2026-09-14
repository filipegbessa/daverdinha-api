# Push Notifications (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the backend send a Web Push notification to the attendant's phone/browser whenever a conversation ends up needing a human, so they don't have to keep the admin open to notice new messages.

**Architecture:** A new `PushSubscription` Prisma model stores one row per browser/device the attendant has opted into notifications on (keyed by their Clerk user id — supports more than one device, and more than one attendant later without a schema change). A `PushSubscriptionsController` (Clerk-guarded) lets the frontend save/remove a subscription. A `PushNotificationsService` wraps the `web-push` npm package and fans a notification out to every stored subscription, self-pruning any the push service reports as gone (404/410). `WebhookController` calls it after `BotEngineService.handleIncomingMessage` finishes, but only when the conversation's `status` is `paused_human` — that's the one signal, checked fresh from the DB, that means a human needs to look at it (bot handed off, whatever the reason: order+delivery flow completed, "atendente" menu item picked, bot globally disabled, etc.). This keeps the push decision in one place instead of threading it through every branch of `BotEngineService`.

**Tech Stack:** NestJS 11, Prisma 5, `web-push` (new dependency), Jest.

**Spec:** No separate spec doc — the design decisions below were settled in conversation with the project owner and are recorded here as constraints.

## Global Constraints

- **Single migration file convention:** this project squashes its entire Prisma migration history into one `*_init` file instead of accumulating one per change (see any existing migration under `prisma/migrations/` — there's only ever one folder). When Task 1 changes `schema.prisma`, delete the existing migration folder and regenerate a single fresh one; do not add a second migration file.
- **No commit trailers:** commits in this project must not include a `Co-Authored-By:` or `Claude-Session:` line — just the summary and body.
- **Stage files by name:** `git add <file> <file>`, never `git add -A` or `git add .`.
- **Notify-when-`paused_human` decision:** a push fires only when, after processing the inbound webhook, the conversation's `status` is `paused_human`. Do not notify while the bot is still handling the conversation on its own — that would page the attendant for every routine bot exchange.
- **Subscription identity:** a `PushSubscription` row is keyed by the Clerk user id (`request.auth.sub`, populated by the existing `ClerkAuthGuard`) — not by conversation, not by a made-up "admin" singleton. One Clerk user may have several subscriptions (phone + laptop, etc.); notify all of them.
- **`ClerkAuthGuard` already exists** (`src/common/auth/clerk-auth.guard.ts`) and sets `request.auth` to the verified Clerk claims object (has a `.sub` field, the Clerk user id) on every guarded route. This plan is the first code to actually read `request.auth` — every existing guarded controller only used the guard as a yes/no gate.
- **`PrismaService` is `@Global()`** (`src/prisma/prisma.module.ts`) — injectable anywhere without importing `PrismaModule`.
- Jest config has `rootDir: 'src'` and matches `*.spec.ts` — new tests must live next to the file they test, inside `src/`.
- `ValidationPipe({ whitelist: true, transform: true })` is already registered globally in `src/main.ts` — DTOs with `class-validator` decorators and nested `@Type()` objects are validated and transformed automatically, no per-controller wiring needed.

---

## Task 1: `PushSubscription` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`
- Migration: delete `prisma/migrations/<existing>_init/`, regenerate

**Interfaces:**
- Produces: Prisma model `PushSubscription` with fields `id: String`, `clerkUserId: String`, `endpoint: String` (unique), `p256dh: String`, `auth: String`, `createdAt: DateTime`. Client type: `PrismaClient.pushSubscription` with the usual `findMany`/`upsert`/`deleteMany`.

- [ ] **Step 1: Add the model to `schema.prisma`**

Append to `prisma/schema.prisma` (after the `OrderItem` model, before EOF):

```prisma
model PushSubscription {
  id          String   @id @default(uuid())
  clerkUserId String   @map("clerk_user_id")
  endpoint    String   @unique
  p256dh      String
  auth        String
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("push_subscriptions")
}
```

- [ ] **Step 2: Regenerate the squashed migration**

```bash
docker exec daverdinha-postgres psql -U daverdinha -d da_verdinha -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
rm -rf prisma/migrations/*_init
npx prisma migrate dev --name init
```

Expected: a new `prisma/migrations/<timestamp>_init/migration.sql` is created and applied; output ends with "Your database is now in sync with your schema."

- [ ] **Step 3: Reseed local data**

```bash
npx prisma db seed
```

- [ ] **Step 4: Verify with a one-off query**

```bash
npx prisma studio
```

Confirm the `push_subscriptions` table exists with columns `id, clerk_user_id, endpoint, p256dh, auth, created_at`. Close Prisma Studio.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add PushSubscription model for web push notifications"
```

**Production migration (do this when the whole feature is ready to ship, not now):** production is on Neon and this project never runs destructive SQL against it automatically — compute the diff instead of dropping anything:

```bash
npx prisma migrate diff --from-url "$PROD_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

This will emit a single additive `CREATE TABLE "push_subscriptions" (...)` statement (no `DROP`, no data risk). Hand that SQL to the project owner to run manually (the auto-mode permission classifier blocks destructive-looking prod DB commands even for additive DDL in this project's history — see prior sessions), then reconcile `_prisma_migrations` the same way past schema changes in this project were rolled out: delete the stale migration-name rows and run `npx prisma migrate resolve --applied <new_migration_name>`.

---

## Task 2: `PushSubscriptionsModule` — save/remove a subscription

**Files:**
- Create: `src/push-subscriptions/dto/save-push-subscription.dto.ts`
- Create: `src/push-subscriptions/dto/remove-push-subscription.dto.ts`
- Create: `src/push-subscriptions/push-subscriptions.service.ts`
- Create: `src/push-subscriptions/push-subscriptions.service.spec.ts`
- Create: `src/push-subscriptions/push-subscriptions.controller.ts`
- Create: `src/push-subscriptions/push-subscriptions.controller.spec.ts`
- Create: `src/push-subscriptions/push-subscriptions.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (`src/prisma/prisma.service.ts`, global), `ClerkAuthGuard` (`src/common/auth/clerk-auth.guard.ts`).
- Produces: `PushSubscriptionsService` with `save(clerkUserId: string, dto: SavePushSubscriptionDto): Promise<PushSubscription>`, `remove(endpoint: string): Promise<void>`, `listAll(): Promise<PushSubscription[]>` — Task 3 (`PushNotificationsService`) calls `listAll()` and `remove()`. HTTP routes: `POST /push-subscriptions` (body: `SavePushSubscriptionDto`), `DELETE /push-subscriptions` (body: `RemovePushSubscriptionDto`).

- [ ] **Step 1: Write the DTOs**

`src/push-subscriptions/dto/save-push-subscription.dto.ts`:

```typescript
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SavePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
```

`src/push-subscriptions/dto/remove-push-subscription.dto.ts`:

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
```

These match the shape of the browser's `PushSubscription.toJSON()` output exactly (`{ endpoint, keys: { p256dh, auth } }`), so the frontend can POST it unmodified.

- [ ] **Step 2: Write the failing service test**

`src/push-subscriptions/push-subscriptions.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PushSubscriptionsService', () => {
  let service: PushSubscriptionsService;
  let prisma: { pushSubscription: any };

  beforeEach(async () => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PushSubscriptionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PushSubscriptionsService);
  });

  it('save() upserts by endpoint, tying the subscription to the given Clerk user', async () => {
    await service.save('user_abc123', {
      endpoint: 'https://fcm.googleapis.com/send/xyz',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.googleapis.com/send/xyz' },
      update: { clerkUserId: 'user_abc123', p256dh: 'p256dh-value', auth: 'auth-value' },
      create: {
        clerkUserId: 'user_abc123',
        endpoint: 'https://fcm.googleapis.com/send/xyz',
        p256dh: 'p256dh-value',
        auth: 'auth-value',
      },
    });
  });

  it('remove() deletes by endpoint', async () => {
    await service.remove('https://fcm.googleapis.com/send/xyz');

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.googleapis.com/send/xyz' },
    });
  });

  it('listAll() returns every stored subscription', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([{ id: 's1' }]);

    const result = await service.listAll();

    expect(result).toEqual([{ id: 's1' }]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx jest src/push-subscriptions/push-subscriptions.service.spec.ts
```

Expected: FAIL — `Cannot find module './push-subscriptions.service'`.

- [ ] **Step 4: Implement the service**

`src/push-subscriptions/push-subscriptions.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';

@Injectable()
export class PushSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  save(clerkUserId: string, dto: SavePushSubscriptionDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { clerkUserId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: {
        clerkUserId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  remove(endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { endpoint } }).then(() => undefined);
  }

  listAll() {
    return this.prisma.pushSubscription.findMany();
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx jest src/push-subscriptions/push-subscriptions.service.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing controller test**

`src/push-subscriptions/push-subscriptions.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

describe('PushSubscriptionsController', () => {
  let controller: PushSubscriptionsController;
  let service: { save: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    service = { save: jest.fn(), remove: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [PushSubscriptionsController],
      providers: [{ provide: PushSubscriptionsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PushSubscriptionsController);
  });

  it('save() reads the Clerk user id off request.auth.sub and forwards the body to the service', () => {
    const dto = { endpoint: 'https://fcm.googleapis.com/send/xyz', keys: { p256dh: 'a', auth: 'b' } };
    const req = { auth: { sub: 'user_abc123' } } as any;

    controller.save(req, dto);

    expect(service.save).toHaveBeenCalledWith('user_abc123', dto);
  });

  it('remove() forwards the endpoint to the service', () => {
    controller.remove({ endpoint: 'https://fcm.googleapis.com/send/xyz' });

    expect(service.remove).toHaveBeenCalledWith('https://fcm.googleapis.com/send/xyz');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
npx jest src/push-subscriptions/push-subscriptions.controller.spec.ts
```

Expected: FAIL — `Cannot find module './push-subscriptions.controller'`.

- [ ] **Step 8: Implement the controller**

`src/push-subscriptions/push-subscriptions.controller.ts`:

```typescript
import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';

@Controller('push-subscriptions')
@UseGuards(ClerkAuthGuard)
export class PushSubscriptionsController {
  constructor(private readonly service: PushSubscriptionsService) {}

  @Post()
  save(@Req() req: Request & { auth: { sub: string } }, @Body() dto: SavePushSubscriptionDto) {
    return this.service.save(req.auth.sub, dto);
  }

  @Delete()
  remove(@Body() dto: RemovePushSubscriptionDto) {
    return this.service.remove(dto.endpoint);
  }
}
```

- [ ] **Step 9: Run it to verify it passes**

```bash
npx jest src/push-subscriptions/push-subscriptions.controller.spec.ts
```

Expected: PASS (2 tests).

- [ ] **Step 10: Wire the module**

`src/push-subscriptions/push-subscriptions.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [PushSubscriptionsService],
  controllers: [PushSubscriptionsController],
  exports: [PushSubscriptionsService],
})
export class PushSubscriptionsModule {}
```

Add it to `src/app.module.ts`'s `imports` array (alongside the other feature modules) and import it at the top of the file:

```typescript
import { PushSubscriptionsModule } from './push-subscriptions/push-subscriptions.module';
```

- [ ] **Step 11: Full test run**

```bash
npx jest
npx tsc --noEmit
```

Expected: all suites pass, no type errors.

- [ ] **Step 12: Commit**

```bash
git add src/push-subscriptions src/app.module.ts
git commit -m "feat: add endpoint to save/remove web push subscriptions"
```

---

## Task 3: `PushNotificationsService` — send the actual notification

**Files:**
- Create: `src/push-notifications/push-notifications.service.ts`
- Create: `src/push-notifications/push-notifications.service.spec.ts`
- Create: `src/push-notifications/push-notifications.module.ts`
- Modify: `package.json` (new dependency)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `PushSubscriptionsService.listAll()` / `.remove(endpoint)` (Task 2).
- Produces: `PushNotificationsService.notifyNewMessage(conversation: { id: string; name: string | null; phone: string }): Promise<void>` — Task 4 calls this.

- [ ] **Step 1: Install `web-push`**

```bash
npm install web-push
npm install -D @types/web-push
```

- [ ] **Step 2: Generate a VAPID keypair (one-time, not part of every dev's setup — do this once for the project)**

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. Add them to `.env.example` (placeholders) and to the real `.env` / production env (real values, generated once and reused — regenerating invalidates every existing browser subscription):

`.env.example` — add these lines:

```
VAPID_PUBLIC_KEY="xxx"
VAPID_PRIVATE_KEY="xxx"
VAPID_SUBJECT="mailto:filipe@example.com"
```

`VAPID_SUBJECT` must be a `mailto:` address or a URL — it's how push services can contact the sender if a key is misbehaving. Use whichever contact address the project owner wants exposed to Google/Mozilla's push infrastructure (it's visible to them, not to end users).

- [ ] **Step 3: Write the failing test**

`src/push-notifications/push-notifications.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import * as webpush from 'web-push';
import { PushNotificationsService } from './push-notifications.service';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';

jest.mock('web-push');

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  let subscriptions: { listAll: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';

    subscriptions = { listAll: jest.fn().mockResolvedValue([]), remove: jest.fn() };
    (webpush.sendNotification as jest.Mock).mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PushNotificationsService,
        { provide: PushSubscriptionsService, useValue: subscriptions },
      ],
    }).compile();

    service = moduleRef.get(PushNotificationsService);
    service.onModuleInit();
  });

  it('configures VAPID details on module init', () => {
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'public-key',
      'private-key',
    );
  });

  it('sends a notification to every stored subscription', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      { endpoint: 'https://push.example/2', p256dh: 'p2', auth: 'a2' },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue(undefined);

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999' });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
      JSON.stringify({ title: 'Nova mensagem', body: 'Maria', url: '/admin/conversas/c1' }),
    );
  });

  it('falls back to the phone number in the body when the conversation has no name', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue(undefined);

    await service.notifyNewMessage({ id: 'c1', name: null, phone: '5521999999999' });

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({ title: 'Nova mensagem', body: '5521999999999', url: '/admin/conversas/c1' }),
    );
  });

  it('removes a subscription the push service reports as gone (410)', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/dead', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999' });

    expect(subscriptions.remove).toHaveBeenCalledWith('https://push.example/dead');
  });

  it('does not remove a subscription on a transient error (e.g. 500)', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999' });

    expect(subscriptions.remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
npx jest src/push-notifications/push-notifications.service.spec.ts
```

Expected: FAIL — `Cannot find module './push-notifications.service'`.

- [ ] **Step 5: Implement the service**

`src/push-notifications/push-notifications.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';

interface NotifiableConversation {
  id: string;
  name: string | null;
  phone: string;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  onModuleInit() {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
  }

  async notifyNewMessage(conversation: NotifiableConversation): Promise<void> {
    const subscriptions = await this.subscriptions.listAll();
    const payload = JSON.stringify({
      title: 'Nova mensagem',
      body: conversation.name ?? conversation.phone,
      url: `/admin/conversas/${conversation.id}`,
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptions.remove(subscription.endpoint);
          }
        }
      }),
    );
  }
}
```

- [ ] **Step 6: Run it to verify it passes**

```bash
npx jest src/push-notifications/push-notifications.service.spec.ts
```

Expected: PASS (5 tests).

- [ ] **Step 7: Wire the module**

`src/push-notifications/push-notifications.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushSubscriptionsModule } from '../push-subscriptions/push-subscriptions.module';

@Module({
  imports: [PushSubscriptionsModule],
  providers: [PushNotificationsService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
```

- [ ] **Step 8: Full test run**

```bash
npx jest
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/push-notifications package.json package-lock.json .env.example
git commit -m "feat: send web push notifications via a new PushNotificationsService"
```

---

## Task 4: Wire it into the webhook — notify only when handed off to a human

**Files:**
- Create: `src/whatsapp/extract-phone.ts`
- Create: `src/whatsapp/extract-phone.spec.ts`
- Modify: `src/whatsapp/webhook.controller.ts`
- Create: `src/whatsapp/webhook.controller.spec.ts`
- Modify: `src/whatsapp/whatsapp.module.ts`

**Interfaces:**
- Consumes: `PushNotificationsService.notifyNewMessage` (Task 3), `PrismaService` (global).
- Produces: `extractPhoneFromWebhookPayload(payload: unknown): string | null` — a small pure helper kept separate from `BotEngineService.extractMessage` (which is private) so the controller doesn't need to change that service's return contract.

- [ ] **Step 1: Write the failing test for the phone-extraction helper**

`src/whatsapp/extract-phone.spec.ts`:

```typescript
import { extractPhoneFromWebhookPayload } from './extract-phone';

describe('extractPhoneFromWebhookPayload', () => {
  it('extracts the sender phone from a well-formed webhook payload', () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999' }] } }] }],
    };

    expect(extractPhoneFromWebhookPayload(payload)).toBe('5521999999999');
  });

  it('returns null when the payload has no messages (e.g. a status update webhook)', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1' }] } }] }] };

    expect(extractPhoneFromWebhookPayload(payload)).toBeNull();
  });

  it('returns null for a malformed payload', () => {
    expect(extractPhoneFromWebhookPayload({})).toBeNull();
    expect(extractPhoneFromWebhookPayload(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/whatsapp/extract-phone.spec.ts
```

Expected: FAIL — `Cannot find module './extract-phone'`.

- [ ] **Step 3: Implement the helper**

`src/whatsapp/extract-phone.ts`:

```typescript
export function extractPhoneFromWebhookPayload(payload: unknown): string | null {
  const from = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  return typeof from === 'string' ? from : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx jest src/whatsapp/extract-phone.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing webhook controller test**

There's no existing test for `WebhookController` — this creates the first one. `src/whatsapp/webhook.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import * as verifySignatureModule from './verify-signature';

describe('WebhookController', () => {
  let controller: WebhookController;
  let botEngine: { handleIncomingMessage: jest.Mock };
  let prisma: { conversation: { findFirst: jest.Mock } };
  let pushNotifications: { notifyNewMessage: jest.Mock };

  const payload = {
    entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'text', text: { body: 'oi' } }] } }] }],
  };

  function fakeRequest() {
    return {
      rawBody: Buffer.from(JSON.stringify(payload)),
      headers: { 'x-hub-signature-256': 'sha256=whatever' },
    } as any;
  }

  beforeEach(async () => {
    process.env.WHATSAPP_APP_SECRET = 'test-secret';
    jest.spyOn(verifySignatureModule, 'verifySignature').mockReturnValue(true);

    botEngine = { handleIncomingMessage: jest.fn().mockResolvedValue(undefined) };
    prisma = { conversation: { findFirst: jest.fn() } };
    pushNotifications = { notifyNewMessage: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: BotEngineService, useValue: botEngine },
        { provide: PrismaService, useValue: prisma },
        { provide: PushNotificationsService, useValue: pushNotifications },
      ],
    }).compile();

    controller = moduleRef.get(WebhookController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifies when the conversation ends up paused_human after processing', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
    });

    await controller.receive(fakeRequest(), payload);

    expect(botEngine.handleIncomingMessage).toHaveBeenCalledWith(payload);
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({ where: { phone: '5521999999999' } });
    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
    });
  });

  it('does not notify when the conversation is still bot_active', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'bot_active',
    });

    await controller.receive(fakeRequest(), payload);

    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });

  it('does not notify when the payload has no extractable phone (e.g. a status webhook)', async () => {
    const statusPayload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1' }] } }] }] };

    await controller.receive(fakeRequest(), statusPayload);

    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx jest src/whatsapp/webhook.controller.spec.ts
```

Expected: FAIL — the current `receive` method never calls `prisma.conversation.findFirst` or `pushNotifications.notifyNewMessage`, so the first two assertions fail.

- [ ] **Step 7: Update the controller**

Replace the full contents of `src/whatsapp/webhook.controller.ts`:

```typescript
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifySignature } from './verify-signature';
import { extractPhoneFromWebhookPayload } from './extract-phone';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Controller('webhook/whatsapp')
export class WebhookController {
  constructor(
    private readonly botEngine: BotEngineService,
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (
      mode === 'subscribe' &&
      verifyToken === process.env.WHATSAPP_VERIFY_TOKEN
    ) {
      return challenge;
    }
    throw new ForbiddenException('Verify token mismatch');
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request, @Body() body: unknown) {
    const rawBody: Buffer = (req as any).rawBody;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (
      !verifySignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET!)
    ) {
      throw new ForbiddenException('Invalid signature');
    }

    await this.botEngine.handleIncomingMessage(body);

    const phone = extractPhoneFromWebhookPayload(body);
    if (phone) {
      const conversation = await this.prisma.conversation.findFirst({ where: { phone } });
      if (conversation?.status === 'paused_human') {
        await this.pushNotifications.notifyNewMessage(conversation);
      }
    }

    return { status: 'ok' };
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

```bash
npx jest src/whatsapp/webhook.controller.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 9: Wire `PushNotificationsModule` into `WhatsAppModule`**

Modify `src/whatsapp/whatsapp.module.ts` — add the import:

```typescript
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
```

And add it to the `imports` array:

```typescript
@Module({
  imports: [BotEngineModule, WhatsAppClientModule, PushNotificationsModule],
  controllers: [WebhookController],
})
```

- [ ] **Step 10: Full test run**

```bash
npx jest
npx tsc --noEmit
```

Expected: every suite passes, no type errors. This is also a good point to manually smoke-test locally: run `npm run start:dev`, use a tool like `ngrok` to expose the webhook, place a test order that ends in `paused_human`, and confirm no crash occurs even without a real subscription in the table (the `Promise.all` over an empty `listAll()` result is a no-op).

- [ ] **Step 11: Commit**

```bash
git add src/whatsapp/extract-phone.ts src/whatsapp/extract-phone.spec.ts src/whatsapp/webhook.controller.ts src/whatsapp/webhook.controller.spec.ts src/whatsapp/whatsapp.module.ts
git commit -m "feat: notify subscribed devices when a conversation is handed off to a human"
```

---

## After this plan ships

The backend is done at this point but produces no visible effect yet — nothing calls `POST /push-subscriptions`, so `listAll()` always returns `[]` and no push is ever actually sent. The paired frontend plan (`daverdinha/docs/plans/2026-09-14-push-notifications.md`) depends on this plan being complete and deployed (it calls `POST /push-subscriptions`, which doesn't exist until Task 2 here ships) — do not start it before this one is finished.
