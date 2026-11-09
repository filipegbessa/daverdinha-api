# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend for the Daverdinha WhatsApp customer-service bot and its admin panel: NestJS 11 + Prisma 5 + Postgres, deployed as a single serverless function on Vercel (Neon in production). `README.md` (in Portuguese) is the detailed design record for each module. Read the relevant section before changing a module's behavior.

## Commands

```bash
docker compose up -d          # local Postgres (postgresql://daverdinha:daverdinha@localhost:5432/daverdinha)
npx prisma migrate dev        # apply schema locally
npx prisma db seed            # seed (bot_settings, the system menu item, bairros + CEP ranges)
npm run start:dev             # local server on PORT or 3001

npm test                                   # unit tests (src/**/*.spec.ts)
npx jest src/bot-engine/bot-engine.service.spec.ts   # single file
npx jest -t "some test name"               # single test by name
npm run test:scripts                       # scripts/**/*.spec.ts (separate jest config, runs outside Nest)
npm run test:e2e                           # test/*.e2e-spec.ts, in band (some count seeded rows while others insert); needs migrated and seeded DB
npm run build

npm run openapi:metadata      # regenerate src/metadata.ts after touching any DTO or controller
```

CI (`.github/workflows/ci.yml`) runs `openapi:metadata` and fails on a diff in `src/metadata.ts`, then runs `test`, `test:scripts`, `build`, and e2e against a seeded Postgres. The e2e suite counts seeded rows. **Lint is not in CI**: `npm run lint` uses `--fix` and the repo has about 500 existing issues, so run it only on files you touched rather than repo-wide.

## Architecture

**Two entry points, one config.** `src/main.ts` (local) and `api/index.ts` (Vercel handler, which caches the Express app between invocations) both call `configureApp()` in `src/bootstrap.ts`. Put app-level wiring there (body parsing, CORS, global `ValidationPipe` with `whitelist`/`transform`, the Clerk proxy, and OpenAPI) so the two entry points don't drift. The global body parser is off. JSON parsing is applied per request so that `/webhook/whatsapp` gets the raw body it needs for Meta HMAC verification (`RawBodyMiddleware`, `verify-signature.ts`).

**Inbound message flow.** `WebhookController` (Meta signature check) → `BotEngineService.handleIncomingMessage` (dedup via `ProcessedWebhookMessage`, resolves the conversation by phone, runs the menu / delivery-CEP / media / catalog-order state machine) → returns the touched `conversationId` → `ConversationNotifierService` sends web push. The webhook must always return 200: Meta re-delivers anything else, and a re-delivery replays the message. Notification failures are therefore caught and logged.

**`ConversationMessengerService` (`src/messaging/`) is the only writer of messages.** It sends to WhatsApp and persists the message in the same step. In that same transaction it keeps the denormalized `Conversation.unread` and `updatedAt` and the `BotSettings.mediaBytesUsed` total. Don't call `WhatsAppClientService` and write `Message` rows by hand elsewhere. The one exception is catalog orders (`handleOrderMessage`), which write message + `Order` in their own transaction and set `unread` manually.

**Conversation status** is `bot_active` ↔ `paused_human`. Every menu-item path ends in a handoff to `paused_human`. Admin replies (`POST /conversations/:id/reply*`) only work in `paused_human`. A `paused_human` conversation that has been idle for 30 or more days silently returns to the bot on the next inbound message.

**Auth.** Admin routes use `ClerkAuthGuard` (Clerk session token). Public routes live in separate controllers (e.g. `PublicDeliveryLocationsController`), so "no auth" is structural rather than a missing decorator. The `/cron/media-retention` cron (scheduled in `vercel.json`) uses `CronSecretGuard`.

**Media.** Images and audio are stored in Cloudflare R2 (`MediaStorageService`, S3 SDK) under unguessable keys. The admin gets 5-minute presigned URLs as JSON. Global (8 GB) and per-conversation (20 images/24h) caps are checked before downloading from Meta. Outbound media goes to Meta first and to R2 only after that succeeds, which avoids orphaned files. Retention deletes by age (3 years) only, never by capacity.

**OpenAPI.** `GET /docs` serves a standalone page (Scalar, with its own Clerk login), and `GET /openapi.json` is behind the Clerk guard. Vercel doesn't run `nest build`, so the swagger plugin output is committed as `src/metadata.ts`. Update DTOs must use `PartialType` from `@nestjs/swagger`, not `@nestjs/mapped-types`. Multipart endpoints need manual `@ApiConsumes`/`@ApiBody`. Webhook and cron controllers use `@ApiExcludeController`.

**Pagination.** List endpoints use `src/common/pagination.ts` (`page`/`perPage`, `pageBounds()`, `paginated()`). **Any new list that can grow with use is paginated from day one** (and filterable on the server, e.g. `?q=` by name), because the admin pages it with `usePaginatedResource`. Only fixed or tiny sets return a bare array, on purpose: menu items, delivery locations, product categories. Say so in the service when a list is deliberately unpaginated. Message threads use cursors instead (`?before=` and an inclusive `?since=`, because the bot writes two messages in the same millisecond, and `id` breaks ties).

**Phones** are stored normalized (`5521…`, no `+` or separators; see `src/common/format-phone.ts`), and conversation lookup by phone depends on it.

## Database migrations — production has real data

Migrations are squashed into a single `prisma/migrations/*_init` folder that is regenerated on every schema change. **Never run `prisma migrate reset` or `migrate deploy` against production after re-squashing; it recreates the schema and wipes the data.** The safe path is `prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma --script`, then review that the output has no `DROP`/`TRUNCATE`, apply it with `prisma db execute`, and run `prisma migrate resolve --applied <folder>`. The README has the full steps.

## Scripts

`scripts/` holds standalone ts-node tools, tested with `npm run test:scripts`: `generate-cep-ranges.ts` (CNEFE → `prisma/data/cep-ranges.json`), `generate-openapi-metadata.ts`, and `import-whatsapp-export.ts` (backfills WhatsApp chat exports; dry-run unless `--commit`). `prisma/data/*.json` currently holds sample data, and the seed creates every bairro with `covered: false`.

**Every new table gets local sample data in `prisma/seed.ts`** in the same change that adds it (see `seedCatalog()`): upsert by a natural key with `update: {}`, so re-running the seed never duplicates rows or overwrites what was edited in the admin. The catalog seed mirrors the site's preview samples (`daverdinha/src/features/site/data/samples.ts`).

## Conventions

Commit messages use Conventional Commits in English (`feat(scope): …`, `fix(scope): …`). README and code-adjacent docs are in Portuguese. Implementation plans live in `docs/plans/`. Unit specs sit next to the code as `*.spec.ts`.
