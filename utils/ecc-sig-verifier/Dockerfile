# Specify the base image
FROM --platform=linux/amd64 rust:1.68.2 as builder

# Set the working directory
WORKDIR /app

# Copy the Cargo files and install dependencies
COPY Cargo.toml Cargo.lock ./
# Copy the source code and build the application
COPY src ./src
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/ecc-sig-verifier /app/ecc-sig-verifier

ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8000
ENV ROCKET_LOG_LEVEL="normal"
EXPOSE 8000

# Start the application
CMD ["/app/ecc-sig-verifier"]
