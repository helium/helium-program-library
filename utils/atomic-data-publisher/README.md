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

Configuration uses a hybrid approach:

- **Environment Variables** - All runtime config (database, ingestor, logging, service params) - **REQUIRED**
- **settings.toml** - Defines polling job configurations and required tables - **REQUIRED**

### Setup

```bash
# Copy example files
cp settings.toml.example settings.toml
cp .env.example .env

# Edit with your values
```

### Environment Variables

Environment variables use double underscore (`__`) for nested config. All variables have defaults except where noted:

```bash
# Database config
DATABASE__HOST=localhost                           # Default: localhost
DATABASE__PORT=5432                                # Default: 5432
DATABASE__USERNAME=postgres                        # Default: postgres
DATABASE__PASSWORD=your_secret                     # Default: postgres
DATABASE__DATABASE_NAME=helium                     # Default: helium
DATABASE__MAX_CONNECTIONS=10                       # Default: 10
DATABASE__MIN_CONNECTIONS=2                        # Default: 2
DATABASE__ACQUIRE_TIMEOUT_SECONDS=30               # Default: 30
DATABASE__IDLE_TIMEOUT_SECONDS=600                 # Default: 600
DATABASE__MAX_LIFETIME_SECONDS=1800                # Default: 1800

# Service config
SERVICE__POLLING_INTERVAL_SECONDS=10               # Default: 10
SERVICE__BATCH_SIZE=500                            # Default: 500
SERVICE__MAX_CONCURRENT_PUBLISHES=50               # Default: 50
SERVICE__DRY_RUN=false                             # Default: false
SERVICE__DRY_RUN_FAILURE_RATE=0.0                  # Default: 0.0
SERVICE__PORT=8000                                 # Default: 8000

# Ingestor config
INGESTOR__ENDPOINT=https://ingestor.helium.io      # Default: http://localhost:8081
INGESTOR__TIMEOUT_SECONDS=30                       # Default: 30
INGESTOR__MAX_RETRIES=3                            # Default: 3
INGESTOR__RETRY_DELAY_SECONDS=5                    # Default: 5

# Logging config
LOGGING__LEVEL=info                                # Default: info
LOGGING__FORMAT=json                               # Default: json

# Signing config (REQUIRED - no meaningful default)
SIGNING__KEYPAIR_PATH=/usr/src/app/secrets/keypair.bin
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

The metrics server is always enabled and serves metrics at `http://0.0.0.0:8080/metrics` by default. Configure the port via:

```bash
SERVICE__PORT=8080
```

## Running

### Local Development

```bash
# Setup configuration files
cp settings.toml.example settings.toml
cp .env.example .env
# Edit both files with your values

# Build
cargo build

# Run (starts both the data publisher and metrics server)
cargo run

# Run with dry-run mode (no actual publishing)
SERVICE__DRY_RUN=true cargo run
```

### Docker

```bash
# Build
docker build -t atomic-data-publisher:latest .

# Run with env vars and volume mounts
docker run \
  --env-file .env \
  -v $(pwd)/settings.toml:/usr/src/app/settings.toml:ro \
  -v $(pwd)/secrets:/usr/src/app/secrets:ro \
  atomic-data-publisher:latest
```

### Kubernetes

**REQUIRED**: Mount settings.toml via ConfigMap and provide all environment variables.

```yaml
# ConfigMap with polling jobs configuration (REQUIRED)
apiVersion: v1
kind: ConfigMap
metadata:
  name: atomic-publisher-config
data:
  settings.toml: |
    [database]
    required_tables = ["asset_owners", "key_to_assets"]

    [[service.polling_jobs]]
    name = "atomic_mobile_hotspots"
    query_name = "construct_atomic_hotspots"
    parameters = { change_type = "mobile_hotspot", hotspot_type = "mobile" }
    # ... more jobs

---
# Deployment
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: atomic-data-publisher
          image: atomic-data-publisher:latest
          env:
            # Database config
            - name: DATABASE__HOST
              value: "postgres.default.svc.cluster.local"
            - name: DATABASE__PORT
              value: "5432"
            - name: DATABASE__USERNAME
              value: "postgres"
            - name: DATABASE__PASSWORD
              valueFrom:
                secretKeyRef:
                  name: atomic-publisher-secrets
                  key: db-password
            - name: DATABASE__DATABASE_NAME
              value: "helium"
            # Service config
            - name: SERVICE__POLLING_INTERVAL_SECONDS
              value: "60"
            - name: SERVICE__BATCH_SIZE
              value: "100"
            - name: SERVICE__PORT
              value: "8080"
            # Ingestor config
            - name: INGESTOR__ENDPOINT
              value: "https://ingestor.helium.io"
            # Signing config
            - name: SIGNING__KEYPAIR_PATH
              value: "/usr/src/app/secrets/keypair.bin"
            # ... add remaining required env vars
          volumeMounts:
            - name: settings
              mountPath: /usr/src/app/settings.toml
              subPath: settings.toml
              readOnly: true
            - name: keypair
              mountPath: /usr/src/app/secrets
              readOnly: true
      volumes:
        - name: settings
          configMap:
            name: atomic-publisher-config
        - name: keypair
          secret:
            secretName: helium-keypair
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
