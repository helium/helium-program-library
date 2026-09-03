---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Stop resubmitting batches whose blockhash has expired. Expiry is decided from
each transaction's own blockhash against the cluster's block height before a
retry slot is consumed, and expired transactions are marked `expired` instead
of retrying to the cap while Jito answers "bundle contains an expired
blockhash". Submitting a transaction the cluster no longer accepts returns the
new `BLOCKHASH_EXPIRED` error, carrying the blockhash and the index of the
transaction in the batch, instead of a raw Jito message.
