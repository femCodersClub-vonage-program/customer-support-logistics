FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @csl/client --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@csl/client

FROM caddy:2.10-alpine AS runner
COPY apps/client/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/client/dist /srv
CMD ["sh", "-c", "test -n \"$API_URL\" || { echo 'API_URL is required' >&2; exit 1; }; exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
