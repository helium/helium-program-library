# syntax=docker.io/docker/dockerfile:1
# Specify the base image
FROM rust:1.68.2 as builder

# Set the working directory
WORKDIR /app

# Copy the Cargo files and install dependencies
COPY Cargo.toml Cargo.lock ./
# Copy the source code and build the application
COPY src ./src
RUN --mount=type=cache,id=cargo-registry-1.68,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git-1.68,target=/usr/local/cargo/git \
    --mount=type=cache,id=ecc-sig-verifier-target,target=/app/target \
    cargo build --release && \
    cp /app/target/release/ecc-sig-verifier /app/ecc-sig-verifier

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/ecc-sig-verifier /app/ecc-sig-verifier

ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8000
ENV ROCKET_LOG_LEVEL="normal"
EXPOSE 8000

# Start the application
CMD ["/app/ecc-sig-verifier"]
