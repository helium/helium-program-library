---
"@helium/blockchain-api-service": patch
---

A transaction the cluster reports confirmed is no longer written expired, and
its batch failed, when it is polled at finalized after its blockhash leaves
range. The extend-delegation procedure judges lockup, expiration and season on
the registrar clock, matching delegate. The pending_transactions index migration
serialises concurrent replicas with an advisory lock and drops an invalid
leftover index concurrently.
