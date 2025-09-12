FROM rust:1.75-slim as builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

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
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /usr/src/app

# Copy the binary from builder stage
COPY --from=builder /usr/src/app/target/release/atomic-data-publisher ./atomic-data-publisher

# Create config directory
RUN mkdir -p config && chown -R app:app /usr/src/app

# Switch to app user
USER app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${ATOMIC_DATA_PUBLISHER_SERVICE_HEALTH_CHECK_PORT:-3000}/health || exit 1

# Expose health check port
EXPOSE 3000

# Set environment variables
ENV RUST_LOG=info
ENV ATOMIC_DATA_PUBLISHER_LOGGING_FORMAT=json

# Run the application
CMD ["./atomic-data-publisher"]
