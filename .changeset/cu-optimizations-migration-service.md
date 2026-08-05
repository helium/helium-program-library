---
"@helium/migration-service": patch
---

Set compute-unit limits on `executeTransactionV0` transactions from simulation instead of the precomputed per-transaction value, which over-requests roughly 1.8x the median on sampled mainnet executions. Lookup tables are fetched once per request, the prioritization-fee estimate is hoisted to one call (the transactions differ only by block PDA, so the writable-account median is effectively identical), and simulations run at bounded concurrency so a large batch doesn't get throttled into the fallback path. Transactions that fail to simulate keep the precomputed limit.
