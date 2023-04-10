#!/bin/bash

solana program dump -u https://api.devnet.solana.com metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s metadata.so
solana program dump -u https://api.devnet.solana.com BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY bgum.so
solana program dump -u https://api.devnet.solana.com noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV noop.so
solana program dump -u https://api.devnet.solana.com cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK compression.so
solana program dump -u https://api.devnet.solana.com CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh clockwork.so
solana program dump -u https://api.devnet.solana.com hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S gov.so
solana program dump -u https://api.devnet.solana.com SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f switchboard.so
solana program dump -u https://api.devnet.solana.com SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu sqds.so
solana account -u https://api.mainnet-beta.solana.com 7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm --output json --output-file pyth.json

solana-test-validator \
  --url https://api.devnet.solana.com \
  --account 7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm pyth.json \
  --clone Fi8vncGpNKbq62gPo56G4toCehWNy77GgqGkTaAF5Lkk \
  --clone $ORACLE_QUEUE \
  --clone $ORACLE_CRANK \
  --clone $SB_STATE \
  --clone $ORACLE_BUF \
  --clone $MULTISIG \
  --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s metadata.so \
  --bpf-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY bgum.so \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV noop.so \
  --bpf-program cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK compression.so \
  --bpf-program CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh clockwork.so \
  --bpf-program hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S gov.so \
  --bpf-program SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f switchboard.so \
  --bpf-program SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu sqds.so \
  --reset
