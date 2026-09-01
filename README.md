# daverdinha-api

Backend do bot de atendimento da Da Verdinha — webhook do WhatsApp, motor do bot, API REST consumida pelo admin, e sincronização de avaliações do Google pro site.

Repositório ainda vazio — o código é construído seguindo o plano de implementação abaixo.

## Stack

NestJS + TypeScript, Prisma + Postgres, Jest + Supertest, `@clerk/backend` (validação de token do admin).

## O que esse serviço faz

- **Webhook do WhatsApp** (`/webhook/whatsapp`) — recebe mensagens da Meta, roda a lógica do bot (menu, checagem de endereço de entrega, escalonamento pra atendente), responde via WhatsApp Cloud API.
- **API REST autenticada** (Clerk) consumida pelo admin — CRUD de menu, locais de entrega, mensagens do bot, histórico de conversas.
- **API REST pública** consumida pelo site institucional — `GET /reviews` e `GET /reviews/summary`, alimentadas por sincronização diária com a Google Places API.

## Setup local

1. `cp .env.example .env` e preencher as variáveis (banco, Clerk, WhatsApp Cloud API, Google Places).
2. `npm install`
3. `npx prisma migrate dev`
4. `npx prisma db seed`
5. `npm run start:dev`

## Deploy

Fase de validação (atual): Vercel (serverless, via `api/index.ts`) + Neon (Postgres). A sincronização de avaliações roda via Vercel Cron (`GET /scheduler/cron`, 1x/dia), não como job interno — não há processo de longa duração numa função serverless.

Migração pra Railway planejada pra quando o projeto sair da fase de teste — nesse ponto, `api/index.ts` deixa de ser necessário e o cron pode virar um `@Cron` interno (`@nestjs/schedule`). Ver `SPEC.md` → "Stack (decidida)" no repositório de planejamento.

## Testes

- `npm test` — unitários
- `npm run test:e2e` — end-to-end (precisa de banco de dev rodando)

## Plano de implementação

Esse repositório é construído seguindo `2026-08-31-da-verdinha-api-backend.md` (14 tasks) — do scaffold até a sincronização de avaliações do Google, em TDD (teste falha → implementa → teste passa → commit). O plano completo, com todo o código e passo a passo, fica no repositório de planejamento do projeto, junto com `SPEC.md` (arquitetura e decisões) e `ROTEIRO-IMPLEMENTACAO.md` (ordem geral e configuração de serviços externos — Meta, Vercel, Neon, Google Cloud).

Consumido por: `daverdinha` (frontend — site institucional + admin).
