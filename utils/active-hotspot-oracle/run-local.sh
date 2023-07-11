#!/bin/bash

./target/debug/active-hotspot-oracle \
  --source-region eu-central-1 \
  --source-bucket delta \
  --source-table silver/test11 \
  --source-access-key-id minioadmin \
  --source-secret-access-key minioadmin \
  --source-endpoint http://localhost:9000 \
  --url http://localhost:8899 \
  --keypair ~/.config/solana/id.json