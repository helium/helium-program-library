---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Stop resubmitting batches whose blockhash has expired. A batch resubmission now
checks the current block height and each transaction's own blockhash before it
consumes a retry slot, and marks its transactions expired instead of retrying them until
the retry cap while Jito answers "bundle contains an expired blockhash". Expiry
is decided from each transaction's own blockhash, and submitting one the cluster no longer accepts returns the new
`BLOCKHASH_EXPIRED` error instead of a raw Jito message.
