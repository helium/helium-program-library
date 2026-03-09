# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS build_image

WORKDIR /usr/src/app

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine
RUN apk add --no-cache libc6-compat

# Copy yarn config
RUN mkdir -p .yarn
COPY .yarnrc.yml .yarnrc.yml
COPY .yarn/releases .yarn/releases

# Copy package.json and lockfile
COPY package.json ./
COPY yarn.deploy.lock ./

# Install dependencies using deploy lockfile
ENV YARN_LOCKFILE_FILENAME=yarn.deploy.lock
RUN yarn install --immutable

# Copy config files (change less frequently than source)
COPY tsconfig.json next.config.mjs postcss.config.mjs ./
COPY sentry.*.config.ts ./
COPY .sequelizerc ./
COPY components.json ./

# Copy source files
COPY src ./src
COPY public ./public
COPY scripts ./scripts

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

RUN yarn run build

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
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/public ./public
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/.next/standalone ./
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/.next/static ./.next/static
# Copy server source maps for Sentry (injected with Debug IDs during build)
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/.next/server ./.next/server

# Copy migration files and dependencies
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/package.json ./package.json
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/.sequelizerc ./.sequelizerc
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/scripts ./scripts
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/src/lib ./src/lib

# Copy all node_modules to preserve dependencies
COPY --from=build_image --chown=nextjs:nodejs /usr/src/app/node_modules ./node_modules

# Ensure static files are readable
RUN chmod -R 755 /app/.next/static

# Create and copy the entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
