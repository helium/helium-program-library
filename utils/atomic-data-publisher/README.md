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
- **settings.toml** - Defines polling job configurations only

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required: Database connection
DATABASE_HOST=localhost
DATABASE_PASSWORD=your_secret
# ... see .env.example for all options

# Required: Signing keypair
SIGNING_KEYPAIR_PATH=/path/to/keypair.bin

# Required: Ingestor endpoint
INGESTOR_ENDPOINT=https://ingestor.helium.io

# Required: Service configuration
SERVICE_POLLING_INTERVAL_SECONDS=10
SERVICE_BATCH_SIZE=500
SERVICE_DRY_RUN=true
# ... etc
```

All fields in `.env.example` are required unless marked [OPTIONAL].

## Metrics

The service includes a built-in Prometheus metrics server that exposes operational metrics:

- **Changes published**: Total number of changes successfully published
- **Errors**: Total number of errors encountered
- **Connection failures**: Ingestor connection failures
- **Retry attempts**: Number of retry attempts made
- **Database query duration**: Time taken for database queries (histogram)
- **Publish duration**: Time taken to publish changes (histogram)
- **Uptime**: Service uptime in seconds

The metrics server is always enabled and serves metrics at `http://0.0.0.0:9090/metrics` by default. Configure the port via environment variable:

```bash
SERVICE_PORT=9090  # Metrics server port
```

Access metrics via:

- Metrics endpoint: `http://localhost:9090/metrics`

## Running

### Local Development

```bash
# Setup environment
cp .env.example .env
# Edit .env with your values

# Build
cargo build

# Run (starts both the data publisher and metrics server)
cargo run

# Run with dry-run mode (no actual publishing)
SERVICE_DRY_RUN=true cargo run
```

### Docker

```bash
# Build the image
docker build -t atomic-data-publisher:latest .

# Run with environment variables and volumes
docker run \
  --env-file .env \
  -v $(pwd)/settings.toml:/usr/src/app/settings.toml:ro \
  -v $(pwd)/secrets:/usr/src/app/secrets:ro \
  -p 9090:9090 \
  atomic-data-publisher:latest
```

### Kubernetes

Mount settings.toml via ConfigMap and use Secrets for sensitive data:

```yaml
# ConfigMap with polling jobs configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: atomic-publisher-config
data:
  settings.toml: |
    # Polling jobs config...

# Deployment
spec:
  containers:
    - name: atomic-data-publisher
      env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: atomic-publisher-secrets
              key: db-password
        - name: DATABASE_HOST
          value: "postgres.default.svc.cluster.local"
        # ... all other env vars
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
