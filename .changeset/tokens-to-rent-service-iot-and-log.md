---
"@helium/tokens-to-rent-service": patch
---

`/estimate`, `/estimates` and `/fees` work for IOT. Jupiter has no SOL to IOT route, so IOT is priced from its sale: the service builds the IOT to SOL swap of a 43,000 IOT probe, scales the amount to 0.020015 SOL (rounded up), and builds the scaled amount to verify it. A verify that pays out more than 105% of 0.020015 SOL is refused. A verify that pays out less is scaled once more, and `/fees` still refuses a build under 95%. An IOT `/fees` request makes up to three `/build` calls. The IOT fee-funding swap is bounded by `maxAccounts=20` only, because no IOT route fits both `maxAccounts=20` and `maxBytes=950`. Every `/fees` transaction over 1232 bytes is now refused before its simulation.

`/fees` signs one transaction for a wallet at a time. For 60 seconds after a wallet's request, a request for the same token returns the same signed transaction, and a request for another token is refused with HTTP 429. Each instance of the service keeps this record in its own memory.

The service keeps each token's estimate for 15 seconds. `/estimate`, `/estimates` and `/fees` share it.

A failed request now answers `{ "error": "<message>" }`. The service removes the RPC URL and the Jupiter API key from the message and from its logs, and no longer logs its RPC URL at start.

The build targets ES2020.
