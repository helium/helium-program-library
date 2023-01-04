FROM rust:latest as builder

WORKDIR /app

COPY . .

RUN cargo build --release

EXPOSE 8080

# Pass all arguments etc to binary
# ENTRYPOINT [ "/target/release/migration-tx-executor" ]
