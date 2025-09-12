# Atomic Data Publisher

Rust service that polls PostgreSQL for hotspot data changes and publishes them to the Helium oracles ingestor via gRPC.

## What it does

- Polls PostgreSQL tables for hotspot updates using block height tracking
- Constructs atomic hotspot data payloads
- Signs and publishes via gRPC to Helium oracles
- Tracks processing state in `atomic_data_polling_state` table

## Configuration

See `config/default.toml` for full configuration options. Key environment variables:

```bash
export ATOMIC_DATA_PUBLISHER_DATABASE_HOST=postgres-host
export ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD=secret
export ATOMIC_DATA_PUBLISHER_INGESTOR_ENDPOINT=https://ingestor.helium.io
export ATOMIC_DATA_PUBLISHER_SIGNING_KEYPAIR_PATH=/path/to/keypair.bin
```

## Running

```bash
# Build
cargo build

# Run
cargo run

# Run with dry-run mode (logs messages without sending)
export ATOMIC_DATA_PUBLISHER_INGESTOR_DRY_RUN=true
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
