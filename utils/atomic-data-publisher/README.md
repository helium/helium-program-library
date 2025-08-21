# Atomic Data Publisher

A Rust service that monitors PostgreSQL database tables for changes and publishes atomic data to an ingestor service. Designed to run on Kubernetes with comprehensive monitoring, error handling, and circuit breaker patterns.

## Overview

The Atomic Data Publisher:

1. **Monitors Database Changes**: Uses PostgreSQL triggers to detect changes in specified columns
2. **Constructs Atomic Data**: Executes configurable queries to build rich atomic data payloads
3. **Publishes to Ingestor**: Sends atomic data to a configurable ingestor service via HTTP
4. **Provides Observability**: Comprehensive metrics, logging, and health checks

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │  Atomic Data     │    │   Ingestor      │
│   Database      │───▶│   Publisher      │───▶│   Service       │
│                 │    │                  │    │                 │
│ • Tables        │    │ • Change         │    │ • REST API      │
│ • Triggers      │    │   Detection      │    │ • Data          │
│ • Tracking      │    │ • Atomic Data    │    │   Processing    │
│   Tables        │    │   Construction   │    │                 │
└─────────────────┘    │ • Publishing     │    └─────────────────┘
                       │ • Metrics        │
                       │ • Health Checks  │
                       └──────────────────┘
```

## Features

### 🔍 Change Detection

- PostgreSQL triggers automatically detect changes in watched columns
- Configurable tracking tables store change events
- Efficient polling mechanism processes changes in batches

### 🏗️ Atomic Data Construction

- Flexible SQL queries construct rich atomic data payloads
- Support for complex joins and aggregations
- JSON output with automatic type handling

### 📡 Reliable Publishing

- HTTP client with retry logic and exponential backoff
- Circuit breaker pattern prevents cascade failures
- Configurable concurrency limits and timeouts

### 📊 Observability

- Comprehensive metrics collection and reporting
- Structured JSON logging with tracing
- Health checks for all components
- Per-table performance metrics

### 🛡️ Error Handling

- Graceful degradation during failures
- Automatic cleanup of processed changes
- Circuit breaker protection for downstream services

## Configuration

Configuration is handled via TOML files and environment variables:

### Environment Variables

All configuration can be overridden with environment variables using the prefix `ATOMIC_DATA_PUBLISHER_`:

```bash
export ATOMIC_DATA_PUBLISHER_DATABASE_HOST=postgres.example.com
export ATOMIC_DATA_PUBLISHER_DATABASE_PORT=5432
export ATOMIC_DATA_PUBLISHER_DATABASE_USERNAME=myuser
export ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD=mypassword
export ATOMIC_DATA_PUBLISHER_DATABASE_DATABASE_NAME=helium
export ATOMIC_DATA_PUBLISHER_INGESTOR_BASE_URL=https://ingestor.example.com
```

### Configuration Files

- `config/default.toml` - Default configuration
- `config/local.toml` - Local overrides (optional)

### Watched Tables Configuration

```toml
[[service.watched_tables]]
name = "hotspots"
change_column = "updated_at"
atomic_data_query = """
  SELECT
    h.id,
    h.address,
    h.name,
    h.location,
    h.owner,
    h.status,
    h.created_at,
    h.updated_at,
    COALESCE(
      json_agg(
        json_build_object(
          'reward_id', r.id,
          'amount', r.amount,
          'currency', r.currency,
          'timestamp', r.timestamp
        )
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'::json
    ) as rewards
  FROM hotspots h
  LEFT JOIN rewards r ON h.id = r.hotspot_id
    AND r.timestamp >= NOW() - INTERVAL '24 hours'
  WHERE h.id = $PRIMARY_KEY
  GROUP BY h.id, h.address, h.name, h.location, h.owner, h.status, h.created_at, h.updated_at
"""
publish_endpoint = "/api/v1/hotspots/atomic-data"
```

## Database Setup

The service automatically creates the necessary tracking infrastructure:

1. **Tracking Tables**: One per watched table (e.g., `hotspots_changes`)
2. **Triggers**: Detect changes in watched columns
3. **Functions**: Handle change notifications

### Required Permissions

The database user needs:

- `SELECT` on watched tables
- `CREATE` permissions for tracking tables and triggers
- `INSERT`, `UPDATE`, `DELETE` on tracking tables

## API Endpoints

### Health Check

```
GET /health
```

Returns service health status and component availability.

### Metrics

```
GET /metrics
```

Returns comprehensive service metrics in JSON format.

## Deployment

### Docker

```bash
# Build the image
docker build -t atomic-data-publisher .

# Run with environment variables
docker run -d \
  --name atomic-data-publisher \
  -e ATOMIC_DATA_PUBLISHER_DATABASE_HOST=postgres.example.com \
  -e ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD=mypassword \
  -e ATOMIC_DATA_PUBLISHER_INGESTOR_BASE_URL=https://ingestor.example.com \
  -p 3000:3000 \
  atomic-data-publisher
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: atomic-data-publisher
spec:
  replicas: 1
  selector:
    matchLabels:
      app: atomic-data-publisher
  template:
    metadata:
      labels:
        app: atomic-data-publisher
    spec:
      containers:
        - name: atomic-data-publisher
          image: atomic-data-publisher:latest
          ports:
            - containerPort: 3000
          env:
            - name: ATOMIC_DATA_PUBLISHER_DATABASE_HOST
              value: "postgres.example.com"
            - name: ATOMIC_DATA_PUBLISHER_DATABASE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: password
            - name: ATOMIC_DATA_PUBLISHER_INGESTOR_BASE_URL
              value: "https://ingestor.example.com"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

## Monitoring

### Metrics

The service exposes comprehensive metrics:

- **Processing Metrics**: Changes processed, published, errors
- **Performance Metrics**: Response times, batch processing times
- **Database Metrics**: Query performance, connection pool status
- **Ingestor Metrics**: Request success rates, circuit breaker status
- **Per-Table Metrics**: Individual table processing statistics

### Logs

Structured JSON logs include:

- Request/response details
- Error information with context
- Performance measurements
- Circuit breaker state changes

### Alerts

Recommended alerts:

- High error rate (>5%)
- Circuit breaker open
- Database connectivity issues
- Ingestor service unavailable
- Processing lag increasing

## Development

### Prerequisites

- Rust 1.75+
- PostgreSQL 12+
- Docker (optional)

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd atomic-data-publisher

# Install dependencies
cargo build

# Run tests
cargo test

# Run locally
RUST_LOG=debug cargo run
```

### Testing

```bash
# Unit tests
cargo test

# Integration tests (requires database)
cargo test --features integration-tests
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**

   - Check database credentials and connectivity
   - Verify user permissions
   - Check firewall rules

2. **Circuit Breaker Open**

   - Check ingestor service health
   - Review ingestor service logs
   - Verify network connectivity

3. **High Memory Usage**

   - Reduce batch size
   - Increase polling interval
   - Check for memory leaks in atomic data queries

4. **Processing Lag**
   - Increase max concurrent publishes
   - Optimize atomic data queries
   - Scale ingestor service

### Debug Mode

Enable debug logging:

```bash
RUST_LOG=debug ./atomic-data-publisher
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

[License information]
