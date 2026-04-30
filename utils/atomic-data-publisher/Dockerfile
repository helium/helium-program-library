# syntax=docker.io/docker/dockerfile:1
FROM rust:1.90.0-bookworm AS BUILD_IMAGE

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=atomic-data-publisher-target,target=/usr/src/app/target \
    cargo build --release && \
    cp /usr/src/app/target/release/atomic-data-publisher /usr/src/app/atomic-data-publisher

FROM debian:bookworm-slim

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=BUILD_IMAGE /usr/src/app/atomic-data-publisher ./atomic-data-publisher

CMD ["./atomic-data-publisher"]
