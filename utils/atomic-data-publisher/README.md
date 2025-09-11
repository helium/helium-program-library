# Atomic Data Publisher

A high-performance Rust service that monitors PostgreSQL database changes and publishes atomic hotspot data to the Helium oracles ingestor via gRPC. Built for production deployment with comprehensive error handling, metrics, and observability.

## Overview

The Atomic Data Publisher bridges the gap between the Helium blockchain data pipeline and the oracles ingestor service. It:

1. **Monitors Database Changes**: Polls PostgreSQL tables for hotspot data updates using block height tracking
2. **Constructs Atomic Data**: Executes optimized SQL queries to build comprehensive hotspot update payloads
3. **Signs Messages**: Cryptographically signs protobuf messages using Helium Ed25519 keypairs
4. **Publishes via gRPC**: Sends signed messages to the Helium oracles ingestor service
5. **Provides Observability**: Comprehensive metrics, structured logging, and health checks

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │  Atomic Data     │    │   Helium        │
│                 │───▶│   Publisher      │───▶│   Oracles       │
│ • hotspot_infos │    │                  │    │   Ingestor      │
│ • asset_owners  │    │ • Block Height   │    │                 │
│ • key_to_assets │    │   Polling        │    │ • gRPC Server   │
│ • recipients    │    │ • Batch Queries  │    │ • Protobuf      │
│ • mini_fanouts  │    │ • Job Queue      │    │   Messages      │
│                 │    │ • Crypto Signing │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Key Features

### 🚀 High Performance

- **Batch Processing**: Processes thousands of records in single optimized SQL queries
- **Smart Pagination**: Adaptive block height chunking based on data volume
- **Concurrent Publishing**: Configurable concurrency limits for gRPC requests
- **Efficient Polling**: Only processes records with `last_block_height > processed_height`

### 🔄 Reliable Processing

- **Job Queue System**: Sequential processing of polling jobs with queue management
- **State Persistence**: Tracks progress per job in `atomic_data_polling_state` table
- **Crash Recovery**: Automatically resumes from last processed block height
- **Retry Logic**: Exponential backoff for failed gRPC requests

### 📊 Production Ready

- **Comprehensive Metrics**: Processing rates, error counts, connection health
- **Structured Logging**: JSON logs with tracing and context
- **Health Checks**: Database, Solana RPC, and publisher health monitoring
- **Graceful Shutdown**: Clean job state cleanup on termination signals

### 🔐 Secure & Compliant

- **Cryptographic Signing**: Ed25519 signatures using Helium crypto library
- **Key Management**: Secure keypair loading from filesystem or generation
- **Input Validation**: Comprehensive configuration and data validation

## Configuration

Configuration is handled via TOML files with environment variable overrides:

### Files

- `config/default.toml` - Base configuration
- `config/local.toml` - Local overrides (optional)

### Environment Variables

All settings can be overridden using the `ATOMIC_DATA_PUBLISHER_` prefix:

```bash
export ATOMIC_DATA_PUBLISHER_DATABASE_HOST=postgres.example.com
export ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD=secret
export ATOMIC_DATA_PUBLISHER_INGESTOR_ENDPOINT=https://ingestor.helium.io
```

### Key Configuration Sections

#### Database

```toml
[database]
host = "localhost"
port = 5432
username = "postgres"
password = "postgres"
database_name = "helium"
max_connections = 10
required_tables = ["asset_owners", "key_to_assets", "mobile_hotspot_infos"]
```

#### Service & Jobs

```toml
[service]
polling_interval_seconds = 10
batch_size = 500
max_concurrent_publishes = 5

[[service.polling_jobs]]
name = "atomic_mobile_hotspots"
query_name = "construct_atomic_hotspots"
parameters = { hotspot_type = "mobile" }

[[service.polling_jobs]]
name = "atomic_iot_hotspots"
query_name = "construct_atomic_hotspots"
parameters = { hotspot_type = "iot" }
```

#### gRPC Ingestor

```toml
[ingestor]
endpoint = "http://localhost:8080"
timeout_seconds = 30
max_retries = 3
retry_delay_seconds = 2
```

## Database Schema

The service expects tables created by the `account-postgres-sink-service`:

### Core Tables

- `mobile_hotspot_infos` - Mobile hotspot account data
- `iot_hotspot_infos` - IoT hotspot account data
- `asset_owners` - Hotspot ownership information
- `key_to_assets` - Entity key to asset mappings
- `recipients` - Rewards recipient information
- `mini_fanouts` - Rewards split configurations

### State Management

The service creates and manages:

- `atomic_data_polling_state` - Job progress tracking with queue management

```sql
CREATE TABLE atomic_data_polling_state (
    job_name VARCHAR(255) NOT NULL,
    query_name VARCHAR(255) NOT NULL DEFAULT 'default',
    queue_position INTEGER NOT NULL DEFAULT 0,
    last_processed_block_height BIGINT NOT NULL DEFAULT 0,
    is_running BOOLEAN NOT NULL DEFAULT FALSE,
    running_since TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    queue_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (job_name, query_name)
);
```

## Query System

The service uses a sophisticated SQL query system to construct atomic hotspot data:

### Core Query: `construct_atomic_hotspots`

- **Optimized CTEs**: Uses composite indexes for efficient data retrieval
- **UNION Strategy**: Combines updates from multiple tables (asset_owners, key_to_assets, recipients, etc.)
- **Batch Processing**: Handles both mobile and IoT hotspots in single queries
- **Rich Data**: Includes ownership, location, device info, and rewards split data

### Query Parameters

- `$1` - hotspot_type ("mobile" or "iot")
- `$2` - last_processed_block_height
- `$3` - current_solana_block_height

## Protobuf Integration

The service generates signed protobuf messages for the Helium oracles:

### Message Types

- `MobileHotspotUpdateReqV1` - Mobile hotspot changes
- `IotHotspotUpdateReqV1` - IoT hotspot changes

### Message Structure

```rust
// Example mobile hotspot message
MobileHotspotUpdateReqV1 {
    update: MobileHotspotUpdateV1 {
        block_height: u64,
        block_time_seconds: u64,
        pub_key: HeliumPubKey,
        asset: SolanaPubKey,
        metadata: MobileHotspotMetadata,
        owner: EntityOwnerInfo,
        rewards_destination: Option<RewardsDestination>,
    },
    signer: String,
    signature: Vec<u8>,
}
```

## Deployment

### Docker

```bash
# Build
docker build -t atomic-data-publisher .

# Run
docker run -d \
  --name atomic-data-publisher \
  -e ATOMIC_DATA_PUBLISHER_DATABASE_HOST=postgres.example.com \
  -e ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD=secret \
  -e ATOMIC_DATA_PUBLISHER_INGESTOR_ENDPOINT=https://ingestor.helium.io \
  -p 3000:3000 \
  atomic-data-publisher
```

### Environment Setup

```bash
# Required environment variables
export ATOMIC_DATA_PUBLISHER_DATABASE_HOST=your-postgres-host
export ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD=your-password
export ATOMIC_DATA_PUBLISHER_INGESTOR_ENDPOINT=https://your-ingestor
export ATOMIC_DATA_PUBLISHER_SIGNING_KEYPAIR_PATH=/path/to/keypair.bin
```

The service automatically starts polling and processing when launched - no additional commands needed.

### Health Checks

The service exposes a health endpoint at `/health` on port 3000 that checks:

- Database connectivity
- Solana RPC availability
- Publisher service status

## Development

### Prerequisites

- Rust 1.75+
- PostgreSQL 12+ with Helium schema
- Access to Helium oracles ingestor service

### Local Development

```bash
# Build
cargo build

# Run with debug logging
RUST_LOG=debug cargo run

# Run tests
cargo test
```

### Key Dependencies

- `sqlx` - PostgreSQL async driver
- `tonic` - gRPC client
- `helium-proto` - Protobuf message definitions
- `helium-crypto` - Cryptographic signing
- `tokio` - Async runtime
- `tracing` - Structured logging

## Monitoring & Observability

### Metrics

The service tracks:

- Changes processed per second
- Publishing success/failure rates
- Database query performance
- gRPC connection health
- Job queue processing times

### Logging

Structured JSON logs include:

- Job processing events
- Database operations
- gRPC request/response details
- Error context and stack traces
- Performance measurements

### Health Monitoring

- Periodic health checks for all components
- Automatic stale job cleanup
- Graceful shutdown with state preservation

## Troubleshooting

### Common Issues

1. **Database Connection Failures**

   - Verify credentials and network connectivity
   - Check required tables exist
   - Ensure user has proper permissions

2. **gRPC Publishing Errors**

   - Verify ingestor endpoint accessibility
   - Check keypair file permissions and format
   - Review gRPC timeout settings

3. **Performance Issues**
   - Adjust `batch_size` and `max_concurrent_publishes`
   - Monitor database query performance
   - Check Solana RPC response times

### Debug Mode

```bash
# For local development
RUST_LOG=debug cargo run

# For Docker deployment
docker run -e RUST_LOG=debug atomic-data-publisher
```

## Architecture Decisions

### Why Polling vs Triggers?

- **Simplicity**: No database-side logic required
- **Reliability**: Immune to trigger failures or database restarts
- **Scalability**: Easier to scale horizontally
- **Observability**: Better visibility into processing pipeline

### Why Job Queues?

- **Memory Management**: Prevents OOM on large datasets
- **Sequential Processing**: Ensures consistent state management
- **Recovery**: Clear restart semantics after failures

### Why Block Height Tracking?

- **Consistency**: Aligns with Solana's block-based architecture
- **Efficiency**: Only processes new/updated records
- **Recovery**: Precise resumption point after crashes

## Contributing

1. Follow Rust best practices and run `cargo clippy`
2. Add tests for new functionality
3. Update configuration documentation
4. Ensure proper error handling and logging

## License

[License information]
