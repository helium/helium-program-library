# syntax=docker.io/docker/dockerfile:1

FROM node:24-alpine AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo@2.9.3
COPY . .
RUN turbo prune @helium/blockchain-api-service --docker

FROM node:24-alpine AS deps
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

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096"

# The build needs no server env vars: src/lib/env.ts is only parsed when the
# server starts, never at compile time.
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm turbo run build --filter=@helium/blockchain-api-service

# Production image
FROM node:24-alpine

WORKDIR /app

ARG SENTRY_RELEASE

ENV NODE_ENV=production
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

# Copy node_modules and packages wholesale so pnpm's symlink layout survives
COPY --from=build --chown=apiuser:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=apiuser:nodejs /app/packages ./packages

COPY --from=build /app/packages/blockchain-api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENV PORT=3000

# pnpm uses node-linker=hoisted, so dependency bins (sequelize-cli) live in the
# workspace root node_modules; keep the package-local bin dir first anyway
ENV PATH="/app/packages/blockchain-api/node_modules/.bin:/app/node_modules/.bin:$PATH"

USER apiuser

# sequelize-cli resolves .sequelizerc paths against the working directory, so
# the entrypoint's migrations need the package root as cwd
WORKDIR /app/packages/blockchain-api

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "--import", "./lib/instrument.js", "lib/server.js"]
