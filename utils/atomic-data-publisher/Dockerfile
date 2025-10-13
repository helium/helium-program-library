FROM rust:1.75-slim as builder
WORKDIR /usr/src/app

COPY Cargo.toml Cargo.lock ./
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create src directory with dummy main to build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (this will be cached)
RUN cargo build --release && rm -rf src

# Copy source code
COPY src ./src

# Build the application
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /usr/src/app

# Copy the binary from builder stage
COPY --from=builder /usr/src/app/target/release/atomic-data-publisher ./atomic-data-publisher

# Switch to app user
USER app

# Expose metrics/health port (configurable via SERVICE_PORT env var)
EXPOSE 8080

# Set environment variables
ENV RUST_LOG=info \
    SERVICE_PORT=8080

# Health check using metrics endpoint
# Note: This assumes SERVICE_PORT=8080. If you change SERVICE_PORT, update the healthcheck in K8s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${SERVICE_PORT:-8080}/metrics || exit 1

# Run the application
CMD ["./atomic-data-publisher"]
