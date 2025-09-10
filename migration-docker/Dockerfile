# Specify the base image
FROM node:20-alpine AS BUILD_IMAGE

WORKDIR /app

COPY tsconfig* .
COPY package.json .
COPY lerna.json .
COPY yarn.lock .

COPY packages packages

COPY target/types target/types

RUN yarn install && yarn global add lerna
RUN lerna bootstrap

RUN yarn run build

FROM node:20-alpine

WORKDIR /app

# Install rust
RUN apt-get update && apt-get install -y pkg-config build-essential libudev-dev libssl-dev bc
ENV CARGO_HOME=/app/.cargo
ENV RUSTUP_HOME=/app
RUN curl https://sh.rustup.rs -sSf | \
    sh -s -- -y

ENV PATH=$CARGO_HOME/bin:$PATH

# Install solana
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.14.7/install)"

ENV PATH=/root/.local/share/solana/install/active_release/bin:$PATH

# Install Anchor
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install 0.26.0 && avm use 0.26.0

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    apt-get install -y unzip && \
    unzip awscliv2.zip && \
    ./aws/install

COPY --from=JS_BUILD_IMAGE /app/packages packages
COPY --from=JS_BUILD_IMAGE /app/node_modules node_modules

COPY Anchor.toml .
COPY Cargo.lock .
COPY Cargo.toml .
COPY programs programs
COPY deps/metaplex-program-library deps/metaplex-program-library
RUN rm -rf deps/metaplex-program-library/bubblegum/program/target && \
  rm -rf deps/metaplex-program-library/token-metadata/program/target
COPY package.json .
COPY lerna.json .
COPY yarn.lock .

COPY ./migration-docker/migrate.sh migrate.sh

COPY ./scripts/init-idls.sh init-idls.sh
COPY ./migration-docker/encrypt-keypairs.sh .
COPY ./migration-docker/local-validator.sh .
COPY ./migration-docker/run-migrate.sh .
COPY ./migration-docker/deploy-programs.sh .
COPY ./migration-docker/deploy-with-retries.sh .

CMD ["./run-migrate.sh"]
