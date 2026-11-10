---
"@helium/spl-utils": minor
"@helium/blockchain-api-service": patch
---

DAS calls in spl-utils now retry dropped connections and 429/502/503/504 twice with backoff. spl-utils exports `withTransientRetry` and `fetchRetryingTransientErrors`, a `fetch` for read-only web3.js `Connection`s. blockchain-api uses it for the key-to-asset lookup without Postgres.
