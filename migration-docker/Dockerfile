# Specify the base image
FROM node:16-alpine AS JS_BUILD_IMAGE

WORKDIR /app

COPY tsconfig* .
COPY package.json .
COPY lerna.json .
COPY yarn.lock .

RUN yarn install

RUN yarn run build

RUN npm prune --production

FROM node:16-alpine

# Install rust
RUN apt-get update && && apt-get install -y pkg-config build-essential libudev-dev libssl-dev
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install solana
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.15.2/install)"

# Install Anchor
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

COPY --from=JS_BUILD_IMAGE /app/packages/helium-admin-cli/lib ./helium-admin-cli/lib
COPY --from=JS_BUILD_IMAGE /app/packages/helium-admin-cli/node_modules ./helium-admin-cli/node_modules
COPY --from=JS_BUILD_IMAGE /app/packages/helium-admin-cli/bin ./helium-admin-cli/node_modules/bin

COPY --from=JS_BUILD_IMAGE /app/packages/migration-service/lib ./migration-service/lib
COPY --from=JS_BUILD_IMAGE /app/packages/migration-service/node_modules ./migration-service/node_modules
COPY --from=JS_BUILD_IMAGE /app/packages/migration-service/bin ./migration-service/node_modules/bin

