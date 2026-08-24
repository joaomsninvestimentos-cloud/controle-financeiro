# AI Coding Guide for Vibe Web Template

This document provides instructions for AI agents on how to contribute to this project. Follow these principles strictly to ensure consistency and maintainability.

## Core Principles

1.  **Predictability**: Use established patterns only. Do not invent new ways of doing things.
2.  **Composability**: Build modular components. Keep logic in services, not in UI components.
3.  **No "Any"**: Always use strong typing. Generate types from DB schema or API responses.

## Directory Structure

- `/db`: Database schema (`schema.ts`) and client (`index.ts`). **Start here for new features.**
- `/lib/services`: Server-side business logic. API routes should call these.
- `/lib`: Core utilities (`api-response.ts`, `request.ts`, `errors.ts`, `logger.ts`).
- `/app/api`: Next.js Route Handlers. Use `handleApiError` from
  `@/lib/api-error-response`.
- `/types`: Shared TypeScript definitions.

## Coding Standards

### 1. Database
- Define tables in `db/schema.ts`.
- Use `db` export from `@/db` for queries.

### 2. API Routes
- Every route must return the `ApiResponse<T>` envelope from
  `@/lib/api-response`. Never return a bare success payload.
- Return success as `NextResponse.json({ success: true, data })`.
- In `catch` blocks, import `handleApiError` from `@/lib/api-error-response` and
  `return handleApiError(error)`. It returns the standardized failure envelope
  and preserves the correct HTTP status.

### 3. Data Fetching
- **Server Components**: Call database services directly.
- **Client Components**: Use `apiClient` from `@/lib/request`.
- `apiClient` returns `ApiResponse<T>`. Check `response.success` before reading
  `response.data`; do not unwrap another nested `data` field.
- **Runtime boundary**: Keep `lib/request.ts` client-safe. It must never import
  database modules, server-only environment modules, or server secrets such as
  `DATABASE_URL`.
- Validate server secrets only inside modules protected by `import 'server-only'`.

### 4. UI & Feedback
- Use `sonner` for toast notifications.
- Use `shadcn/ui` patterns for components.
- Use `react-hook-form` + `zod` for all forms.

## Providing Feedback
Always inform the user when an action succeeds or fails using `toast()`.
