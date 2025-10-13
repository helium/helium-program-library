FROM rust:1.85-slim AS BUILD_IMAGE

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=BUILD_IMAGE /usr/src/app/target/release/atomic-data-publisher ./atomic-data-publisher

CMD ["./atomic-data-publisher"]
