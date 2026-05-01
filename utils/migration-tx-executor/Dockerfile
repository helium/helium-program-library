# syntax=docker.io/docker/dockerfile:1
FROM rust:latest as builder

WORKDIR /app

COPY Cargo.toml .
COPY Cargo.lock .
COPY src src

RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=migration-tx-executor-target,target=/app/target \
    cargo build --release && \
    cp /app/target/release/migration-tx-executor /app/migration-tx-executor

EXPOSE 8080

# Pass all arguments etc to binary
ENTRYPOINT [ "/app/migration-tx-executor" ]
