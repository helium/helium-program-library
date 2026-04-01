# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @helium/blockchain-api-service --docker

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY --from=pruner /app/out/full/ .
COPY tsconfig*.json ./
# Copy pre-built idls (requires Rust build output not available in Docker)
COPY packages/idls/lib/ packages/idls/lib/
RUN mkdir -p target/types && echo 'export {}' > target/types/_placeholder.ts

# Sentry build args for sourcemap upload during build
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE

# Set dummy environment variables for build time
ENV PG_USER=dummy \
    PG_NAME=dummy \
    PG_HOST=dummy \
    PG_PORT=5432 \
    BRIDGE_API_KEY=dummy \
    ORACLE_API_KEY=dummy \
    BRIDGE_API_URL=https://api.sandbox.bridge.xyz/v0 \
    PRIVY_APP_SECRET=dummy \
    NEXT_PUBLIC_PRIVY_APP_ID="__NEXT_PUBLIC_PRIVY_APP_ID__" \
    NEXT_PUBLIC_SOLANA_CLUSTER="__NEXT_PUBLIC_SOLANA_CLUSTER__" \
    NEXT_PUBLIC_SOLANA_URL="__NEXT_PUBLIC_SOLANA_URL__" \
    NEXT_PUBLIC_WORLD_HELIUM_URL="__NEXT_PUBLIC_WORLD_HELIUM_URL__" \
    JITO_BLOCK_ENGINE_URL="__JITO_BLOCK_ENGINE_URL__" \
    JITO_API_KEY="__JITO_API_KEY__" \
    JUPITER_API_KEY="__JUPITER_API_KEY__" \
    SENTRY_DSN="__SENTRY_DSN__" \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096"

# Sentry env vars for automatic sourcemap upload during build
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_RELEASE=${SENTRY_RELEASE}

RUN pnpm turbo run build --filter=@helium/blockchain-api-service

# Production image, copy all the files and run next
FROM node:22-alpine

WORKDIR /app

# Re-declare build arg to make it available in this stage
ARG SENTRY_RELEASE

ENV NODE_ENV=production
# Persist SENTRY_RELEASE for runtime error tagging
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# Install tools needed for the entrypoint script
RUN apk add --no-cache jq sed

# Create the nextjs user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/.next/cache && \
    chown -R nextjs:nodejs /app

# Copy built files with correct ownership
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/public ./public
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/static ./.next/static
# Copy server source maps for Sentry (injected with Debug IDs during build)
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.next/server ./.next/server

# Copy migration files and dependencies
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/.sequelizerc ./.sequelizerc
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/scripts ./scripts
COPY --from=build --chown=nextjs:nodejs /app/packages/blockchain-api/src/lib ./src/lib

# Copy all node_modules to preserve dependencies
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

# Ensure static files are readable
RUN chmod -R 755 /app/.next/static

# Create and copy the entrypoint script
COPY packages/blockchain-api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
