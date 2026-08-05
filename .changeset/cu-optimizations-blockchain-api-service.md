---
"@helium/blockchain-api-service": patch
---

Price transactions with the cluster's own fee calculation instead of local compute-budget math. `getTransactionFee`/`getTotalTransactionFees` now take a `Connection` and resolve via `getFeeForMessage`, so quoted fees track base, priority, and any future fee components (SIMD-0553 resource fees) without client-side modeling. The local fallback used when the RPC can't answer parses the u64 CU price without the signed-shift overflow past 2^31 and models the runtime's 200k-per-instruction default (capped at 1.4M) rather than a flat 200k.

`buildVersionedTransaction` resolves address lookup tables once and shares them with `withPriorityFees` and the message compile, fetches the blockhash concurrently with fee estimation, and on estimation failure falls back to spl-utils' measured compute-unit table instead of shipping instructions with no compute budget. Hardcoded 500k compute-unit limits are dropped from the remaining procedures.
