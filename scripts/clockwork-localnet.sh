#!/bin/bash

clockwork localnet \
  --bpf-program circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g target/deploy/circuit_breaker.so \
  --bpf-program credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT target/deploy/data_credits.so \
  --bpf-program hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8 target/deploy/helium_entity_manager.so \
  --bpf-program hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR target/deploy/helium_sub_daos.so \
  --bpf-program 1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w target/deploy/lazy_distributor.so \
  --bpf-program 1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h target/deploy/lazy_transactions.so \
  --bpf-program treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5 target/deploy/treasury_management.so \
  --bpf-program hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8 target/deploy/voter_stake_registry.so \
  --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s deps/metaplex-program-library/token-metadata/target/deploy/mpl_token_metadata.so \
  --bpf-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY deps/metaplex-program-library/bubblegum/program/target/deploy/mpl_bubblegum.so \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV deps/solana-program-library/account-compression/target/deploy/spl_noop.so \
  --bpf-program cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK deps/solana-program-library/account-compression/target/deploy/spl_account_compression.so \
  --url https://api.mainnet-beta.solana.com \
  --clone hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S \
  --clone ENmcpFCpxN1CqyUjuog9yyUVfdXBKF3LVCwLr7grJZpk \
  --clone 7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm \
  --clone SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f \
  --clone E3cqnoFvTeKKNsGmC8YitpMjo2E39hwfoyt2Aiem7dCb \
  --clone GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR \
  --clone Fi8vncGpNKbq62gPo56G4toCehWNy77GgqGkTaAF5Lkk \
  --clone G9kgMJSeBy5Uhj3NJjL6kveyiepLAESybcB3zgdfw8ER \
  --clone 7nYabs9dUhvxYwdTnrWVBL9MYviKSfrEbdWCUbcnwkpF

## bpf programs are copied directly from anchor.toml
## clones are also copied directly from anchor.toml, but some additional clones are needed for program accounts