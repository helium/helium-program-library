# Atomic Data Publisher

Rust service that polls PostgreSQL for hotspot data changes and publishes them to the Helium oracles ingestor via gRPC.

## What it does

- Polls PostgreSQL tables for entity data changes using block tracking
- Constructs atomic entity data payloads for different change types:
  - **Hotspot metadata changes** (location, device info, etc.)
  - **Entity ownership changes** (NFT ownership transfers)
  - **Reward destination changes** (where rewards are sent)
- Signs and publishes via gRPC to Helium oracles using appropriate service endpoints
- Tracks processing state in `atomic_data_polling_state` table

## Configuration

Configuration is managed through TOML files:

- `config/default.toml` - Default configuration settings
- `config/local.toml` - Local overrides (create this file for your environment)

Example `config/local.toml`:

```toml
[database]
host = "your-postgres-host"
password = "your-secret"

[signing]
keypair_path = "/path/to/your/keypair.bin"

[ingestor]
endpoint = "https://ingestor.helium.io"
```

## Metrics

The service includes a built-in Prometheus metrics server that exposes operational metrics:

- **Changes published**: Total number of changes successfully published
- **Errors**: Total number of errors encountered
- **Connection failures**: Ingestor connection failures
- **Retry attempts**: Number of retry attempts made
- **Database query duration**: Time taken for database queries (histogram)
- **Publish duration**: Time taken to publish changes (histogram)
- **Uptime**: Service uptime in seconds

The metrics server is always enabled and serves metrics at `http://0.0.0.0:9090/metrics` by default. Configure the port in the `[service]` section:

```toml
[service]
port = 9090  # Metrics server port
```

Access metrics via:

- Metrics endpoint: `http://localhost:9090/metrics`

## Running

```bash
# Build
cargo build

# Run (starts both the data publisher and metrics server)
cargo run

# Run with dry-run mode (logs messages without sending)
# Set dry_run = true in your config/local.toml
cargo run
```

## Dependencies

Requires PostgreSQL with tables from `account-postgres-sink-service`. Creates `atomic_data_polling_state` table for tracking progress.

## Development

```bash
# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run
```
