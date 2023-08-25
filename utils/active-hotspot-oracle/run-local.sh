#!/bin/bash

./target/debug/active-hotspot-oracle \
  --aws-region eu-central-1 \
  --aws-bucket delta \
  --aws-table gold/active_hotspots \
  --access-key-id minioadmin \
  --secret-access-key minioadmin \
  --aws-endpoint http://localhost:9000 \
  --url https://rpc.helius.xyz/?api-key=89ea4930-3f9f-4c66-af09-94092d463811 \
  --keypair ~/.config/solana/id.json