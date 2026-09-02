---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Report the transaction that actually failed a Jito bundle simulation: the error
data, the Sentry extras and the classifier all use the failing transaction's own
logs plus its index, instead of a flat concatenation of every transaction's logs.
`SIMULATION_FAILED` data carries the new optional `failedTransactionIndex`.
