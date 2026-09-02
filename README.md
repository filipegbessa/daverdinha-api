# daverdinha-api

Backend do bot de atendimento da Daverdinha (NestJS + Prisma + Postgres).

## Setup local

1. `cp .env.example .env` e preencher as variáveis (banco, Clerk, WhatsApp Cloud API).
2. `npm install`
3. `npx prisma migrate dev`
4. `npx prisma db seed`
5. `npm run start:dev`

## Deploy (fase de validação — Vercel)

1. Conectar o repositório no [vercel.com](https://vercel.com).
2. Configurar as env vars do `.env.example` no dashboard do projeto (usar o `DATABASE_URL` do Neon).
3. O `vercel.json` já direciona todas as rotas pra `api/index.ts` — não precisa configurar build command especial.
4. Rodar `npx prisma migrate deploy` apontando pro banco do Neon antes do primeiro deploy.

Migração futura pra Railway (fase de produção): ver `SPEC.md` → "Stack (decidida)".

## Testes

- `npm test` — unitários
- `npm run test:e2e` — end-to-end (precisa de banco de dev rodando)

## Estrutura

- `src/` — módulos NestJS (`bot-settings`, `menu-items`, `delivery-locations`, `whatsapp`, `bot-engine`, `prisma`, `common/auth`).
- `api/index.ts` — entry point serverless usado pelo deploy na Vercel (envolve o `AppModule` num handler Express com instância cacheada entre invocações).
- `src/main.ts` — entry point usado localmente via `npm run start:dev`.

> Nota: o módulo `conversations` (histórico de conversas, uso administrativo) foi propositalmente adiado e ainda não existe neste código — não é necessário para o bot funcionar.

Ver `docs/superpowers/plans/2026-08-31-da-verdinha-api-backend.md` e `SPEC.md` (raiz do monorepo) para o desenho completo.
