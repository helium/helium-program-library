FROM rust:latest as builder

WORKDIR /app

COPY Cargo.toml .
COPY Cargo.lock .
COPY src src

RUN cargo build --release

EXPOSE 8080

# Pass all arguments etc to binary
ENTRYPOINT [ "/app/target/release/migration-tx-executor" ]
