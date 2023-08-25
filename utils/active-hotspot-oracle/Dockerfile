# Specify the base image
FROM rust:1.70.0 as builder

# Set the working directory
WORKDIR /app

# Copy the source code and build the application
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/active-hotspot-oracle /app/active-hotspot-oracle

# Start the application
ENTRYPOINT ["/app/active-hotspot-oracle"]
