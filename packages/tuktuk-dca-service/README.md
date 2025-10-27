# Tuktuk DCA Service

A service that handles DCA (Dollar Cost Averaging) swaps using Jupiter's API for the Helium ecosystem.

## Overview

This service provides an API endpoint that processes DCA swap requests by:
1. Fetching quotes from Jupiter API
2. Creating swap transactions using Jupiter's routing
3. Integrating with the Tuktuk DCA program

## Environment Variables

- `SOLANA_URL`: Solana RPC endpoint (default: https://api.mainnet-beta.solana.com)
- `JUPITER_API_URL`: Jupiter Lite API endpoint (default: https://lite-api.jup.ag)
- `PORT`: Service port (default: 8123)
- `DCA_SIGNER_SECRET`: Base58 encoded secret key for the DCA signer

## API Endpoints

### Health Check
```
GET /health
```

### DCA Swap
```
POST /dca/:dcaKey
```

Body:
```json
{
  "task_queue": "string",
  "task": "string", 
  "task_queued_at": "string"
}
```

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Start production server
yarn start
```

## Docker

```bash
# Build image
docker build -t tuktuk-dca-service .

# Run container
docker run -p 8123:8123 -e DCA_SIGNER_SECRET=your_secret_key tuktuk-dca-service
```
