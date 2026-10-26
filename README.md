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
