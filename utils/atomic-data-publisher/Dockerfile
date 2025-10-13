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
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /usr/src/app

# Copy the binary from builder stage
COPY --from=builder /usr/src/app/target/release/atomic-data-publisher ./atomic-data-publisher

# Create directories for K8s volume mounts
# - /usr/src/app/settings.toml for ConfigMap (polling jobs config)
# - /usr/src/app/secrets for keypair Secret
RUN mkdir -p secrets && chown -R app:app /usr/src/app

# Switch to app user
USER app

# Expose metrics/health port
EXPOSE 9090

# Set environment variables
ENV RUST_LOG=info

# Health check using metrics endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:9090/metrics || exit 1

# Run the application
CMD ["./atomic-data-publisher"]
