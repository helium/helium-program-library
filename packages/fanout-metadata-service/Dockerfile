# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @helium/fanout-metadata-service --docker

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=pruner /app/out/json/ .
ENV PNPM_STORE_DIR=/pnpm/store
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY --from=pruner /app/out/full/ .
COPY tsconfig*.json ./
# Copy pre-built idls (requires Rust build output not available in Docker)
COPY packages/idls/lib/ packages/idls/lib/
RUN mkdir -p target/types && echo 'export {}' > target/types/_placeholder.ts
RUN pnpm turbo run build --filter=@helium/fanout-metadata-service

FROM node:22-alpine
WORKDIR /app

COPY --from=build /app/packages/fanout-metadata-service/lib ./lib
COPY --from=build /app/node_modules ./node_modules

# Anchor dummy wallet
RUN echo '[124,96,181,146,132,165,175,182,60,194,167,230,29,91,110,109,226,38,41,155,207,186,24,33,205,120,108,98,218,67,77,95,13,60,79,204,253,10,183,101,60,94,220,177,117,97,16,29,31,124,35,65,121,147,161,114,159,23,207,202,122,164,170,201]' > id.json
ENV ANCHOR_WALLET=/app/id.json

CMD ["node", "lib/src/index.js"]
