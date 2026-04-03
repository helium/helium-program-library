# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo@2.9.3
COPY . .
RUN turbo prune @helium/blockchain-api-service --docker

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY --from=pruner /app/out/json/ .
ENV PNPM_STORE_DIR=/pnpm/store
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY --from=pruner /app/out/full/ .
COPY tsconfig*.json ./
COPY packages/idls/lib/ packages/idls/lib/
RUN mkdir -p target/types && echo 'export {}' > target/types/_placeholder.ts

ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE

# NEXT_PUBLIC_ vars are inlined by webpack at compile time; placeholders
# get replaced at runtime by docker-entrypoint.sh
ENV NEXT_PUBLIC_PRIVY_APP_ID="__NEXT_PUBLIC_PRIVY_APP_ID__" \
    NEXT_PUBLIC_SOLANA_CLUSTER="__NEXT_PUBLIC_SOLANA_CLUSTER__" \
    NEXT_PUBLIC_SOLANA_URL="__NEXT_PUBLIC_SOLANA_URL__" \
    NEXT_PUBLIC_WORLD_HELIUM_URL="__NEXT_PUBLIC_WORLD_HELIUM_URL__" \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096"

ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_RELEASE=${SENTRY_RELEASE}

# Server env vars don't reach Next.js 15 worker threads via Docker ENV,
# so write dummy values to .env for the build to read from disk
RUN printf '%s\n' \
    'SKIP_ENV_VALIDATION=1' \
    'PG_USER=build' \
    'PG_NAME=build' \
    'PG_HOST=localhost' \
    'PG_PORT=5432' \
    'PRIVY_APP_SECRET=build' \
    'BRIDGE_API_KEY=build' \
    'JUPITER_API_KEY=build' \
    > packages/blockchain-api/.env && \
    pnpm turbo run build --filter=@helium/blockchain-api-service

# Production image
FROM node:22-alpine

WORKDIR /app

ARG SENTRY_RELEASE

ENV NODE_ENV=production
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

RUN apk add --no-cache jq sed

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/.next/cache && \
    chown -R nextjs:nodejs /app

# Standalone output: in a monorepo, server.js is nested under the package path
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/public ./public
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/standalone/packages/blockchain-api/ ./
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/static ./.next/static

# Sentry source maps only — copy .map files without overwriting standalone server chunks
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/server/*.js.map ./.next/server/

# Standalone node_modules for Next.js runtime
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/standalone/node_modules ./node_modules
# Full workspace node_modules overlay for sequelize-cli migrations
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

# Migration files (sequelize-cli reads these via .sequelizerc)
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.sequelizerc ./.sequelizerc
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/src/lib/config ./src/lib/config
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/src/lib/migrations ./src/lib/migrations

RUN chmod -R 755 /app/.next/static

COPY --from=build /app/packages/blockchain-api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
