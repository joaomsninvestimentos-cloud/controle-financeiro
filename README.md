# vibe-web-template

A general-purpose Next.js web application template with database initialization and AI-friendly foundations.

## Features

- **Standardized Utilities**: Client-safe wrappers for `fetch` and a leveled `logger`.
- **Database Ready**: Drizzle ORM + PostgreSQL initialization pre-configured.
- **UI System**: Tailwind CSS 4, the full Radix UI primitive set (shadcn-style components under `components/ui/`), and `sonner` for notifications.
- **Offline-safe Builds**: The default system font stack does not fetch Google Fonts during builds.
- **Forms**: React Hook Form + Zod resolvers.
- **AI-Friendly**: Ships with `docs/AI_GUIDE.md` to keep AI-generated code consistent.

## Tech Stack

- Next.js 16 (App Router)
- React 19 / TypeScript 5
- Tailwind CSS 4
- Drizzle ORM + PostgreSQL (`postgres` driver)
- Zod + React Hook Form
- Zustand (state management)
- Vercel Analytics + optional Umami script injection

## Getting Started

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Environment variables**:
   Copy `.env.example` to `.env` and configure at minimum `DATABASE_URL`. Umami analytics variables (`NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`) are optional and only injected in production.

3. **Run development server** (port 13000):
   ```bash
   pnpm dev
   ```

4. **Verify changes**:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm build
   ```

5. **Database commands**:
   - `pnpm db:generate` — generate migrations
   - `pnpm db:migrate` — run migrations
   - `pnpm db:studio` — open Drizzle Studio

## Despesas fixas (recorrência automática)

Ao lançar, marcar **“Despesa fixa (repete todo mês)”** cria uma *série*
(`recorrencias`) e materializa as ocorrências do mês inicial + os 12 seguintes.
Não existe cron nem botão de copiar: as ocorrências são garantidas na leitura.

- **Geração idempotente**: `GET /api/items?mes=YYYY-MM` chama
  `sincronizarRecorrencias`, que calcula o que falta (`lib/recorrencia.ts`) e
  insere com `ON CONFLICT DO NOTHING` sobre o índice único
  `items (recorrencia_id, mes)`.
- **Extensão automática**: abrir um mês além do horizonte gera até aquele mês
  (limitado por `mes_fim`).
- **Dia fixo**: dia 31 em mês de 30 cai no último dia do mês.
- **Editar** uma ocorrência vale **deste mês em diante** (a série e os meses
  seguintes são atualizados; o passado não muda).
- **Remover** uma ocorrência = **pular aquele mês** (fica registrado em
  `recorrencia_pulos` e não volta).
- **Encerrar** (aba *Fixas*) mantém o mês atual e o histórico e apaga as
  ocorrências futuras.
- Lançamentos antigos com a etiqueta `recorrente` são convertidos em séries
  automaticamente (`migrarRecorrentesLegados`), uma vez só.

O schema é criado em runtime por `ensureRecorrenciaSchema` (idempotente, com
`pg_advisory_xact_lock` para evitar corrida entre cold starts). O DDL vive em
`lib/recorrencia-ddl.ts` e é testado contra um Postgres real (PGlite) em
`lib/recorrencia-ddl.test.ts`.

## FinBot (chat com IA)

O `POST /api/chat` fala com um provedor compatível com a API da Anthropic
(`${BASE_URL}/messages`). A configuração é resolvida automaticamente:

| item | ordem de fallback |
| --- | --- |
| base URL | `USER_LLM_BASE_URL` → `BTY_LLM_SERVER_BASE_URL` → `REACTUS_BASE_URL` + `/v1` |
| chave | `USER_LLM_API_KEY` → `BTY_LLM_SERVER_API_KEY` → `HAPPYSEEDS_KEY` |
| modelo | `USER_LLM_MODEL` → `claude-sonnet-4.6` |

Ou seja: em ambientes que já expõem `REACTUS_BASE_URL` + `BTY_LLM_SERVER_API_KEY`
nada precisa ser preenchido. Para diagnosticar, use:

- `GET /api/health` → `data.finbot.configured` (público, sem segredos)
- `GET /api/chat` → `{ configured, baseUrl, model, missing }` (requer sessão)

Se o provedor estiver fora ou mal configurado, o FinBot não quebra: responde em
**modo offline** com o resumo do mês calculado no servidor e o detalhe técnico
discreto no fim da mensagem.

## Project Structure

- `app/` — Next.js App Router (`layout.tsx`, `page.tsx`, `api/`).
- `components/` — `AgentationGuard.tsx` plus shadcn-style primitives in `components/ui/`.
- `db/` — Drizzle client (`db/index.ts`).
- `lib/` — Core utilities: `api-response.ts`, `api-error-response.ts`, `request.ts`, `logger.ts`, `errors.ts`, `utils.ts`, `agentationFeedbackMode.ts`.
- `hooks/` — Shared hooks (`use-mobile.ts`, `use-toast.ts`).
- `utils/` — `cn.ts` (clsx + tailwind-merge).
- `docs/` — `AI_GUIDE.md` (AI/developer conventions).
- `Dockerfile` — Multi-stage node:22-slim build exposing port 13000.
