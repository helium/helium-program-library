---
"@helium/tokens-to-rent-service": patch
---

`/estimate`, `/estimates` and `/fees` work for IOT. Jupiter has no SOL to IOT route, so IOT is priced from its sale: the service builds the IOT to SOL swap of a 43,000 IOT probe, scales the amount to 0.020015 SOL (rounded up), and builds the scaled amount to verify it. A verify that pays out more than 105% of 0.020015 SOL is refused. A verify that pays out less is scaled once more, and `/fees` still refuses a build under 95%. An IOT `/fees` request makes up to three `/build` calls. The IOT fee-funding swap is bounded by `maxAccounts=20` only, because no IOT route fits both `maxAccounts=20` and `maxBytes=950`. Every `/fees` transaction over 1232 bytes is now refused before its simulation.

`/fees` signs one transaction for a wallet and token at a time. While the build is in flight, and for 90 seconds after it resolves, a request for the same wallet and token returns the same signed transaction. A request for another token builds its own transaction. Each instance of the service keeps this record in its own memory.

Each instance signs at most `FUND_FEES_MAX_PER_MINUTE` (default 20) new `/fees` transactions in any minute, over all wallets. Past the limit, `/fees` answers 429.

The service keeps each token's estimate for 15 seconds. `/estimate`, `/estimates` and `/fees` share it.

A failed request now answers `{ "error": "<message>" }` with HTTP 400 when the request is wrong (a missing or invalid `wallet` or `mint`, a mint the service does not swap, or the platform wallet as the user), 429 when the instance has signed its limit for the minute, 502 when the service refuses Jupiter's answer or Jupiter does not answer in 15 seconds, and 500 for any other failure. The service removes the RPC URL and the Jupiter API key from the message and from its logs, and no longer logs its RPC URL at start or in a failure to start.

The build targets ES2020.
