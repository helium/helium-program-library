---
"@helium/blockchain-api-service": patch
---

Harden batch status tracking. Landed batches are resolved from one batched
signature-status read, the status transaction is held only for writes, a status
update that loses the compare-and-swap reloads the row instead of overwriting a
terminal state, and a tick Jito cannot answer is skipped rather than marked
failed. Manual resubmits check batch status first, keep the stored submission
type, and no longer double-count the Jito tip's signature fee.
