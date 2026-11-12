FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @csl/crm --docker

FROM base AS builder
ARG API_URL
ENV API_URL=$API_URL
RUN test -n "$API_URL" || { echo 'API_URL is required at build time: the /api rewrites are fixed when Next.js builds' >&2; exit 1; }
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@csl/crm

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app .
USER node
WORKDIR /app/apps/crm
EXPOSE 3001
CMD ["sh", "-c", "test -n \"$API_URL\" || { echo 'API_URL is required' >&2; exit 1; }; exec node_modules/.bin/next start --hostname 0.0.0.0 --port ${PORT:-3001}"]
