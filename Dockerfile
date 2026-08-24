FROM node:22-slim AS builder

WORKDIR /app
ENV CI=true

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY . .

RUN pnpm install --frozen-lockfile && pnpm run build && (test -d public || mkdir public)

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV CI=true

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.env ./.env
COPY --from=builder /app/public* ./public

RUN pnpm install --frozen-lockfile --prod

EXPOSE 13000

CMD ["pnpm", "start"]
