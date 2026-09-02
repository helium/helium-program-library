---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Stop resubmitting batches whose blockhash has expired. A batch resubmission now
checks the current block height and each transaction's own blockhash before it
consumes a retry slot, and marks the batch expired instead of retrying it until
the retry cap while Jito answers "bundle contains an expired blockhash". A
transaction's recorded `lastValidBlockHeight` is derived from that transaction's
own blockhash, and submitting one the cluster no longer accepts returns the new
`BLOCKHASH_EXPIRED` error instead of a raw Jito message.
