# Atomic Data Publisher

Rust service that polls PostgreSQL for hotspot data changes and publishes them to the Helium oracles ingestor via gRPC.

## What it does

- Polls PostgreSQL tables for hotspot updates using block height tracking
- Constructs atomic hotspot data payloads
- Signs and publishes via gRPC to Helium oracles
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

## Running

```bash
# Build
cargo build

# Run
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
