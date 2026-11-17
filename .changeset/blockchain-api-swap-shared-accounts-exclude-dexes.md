---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

`getInstructions` takes an optional `useSharedAccounts`, and `getQuote` takes an optional `excludeDexes` (comma-separated Jupiter DEX labels). Each is forwarded to Jupiter only when set, so a caller that omits them sends the requests it sent before. `useSharedAccounts` is forwarded to Jupiter's swap-instructions request as the same-named field. `excludeDexes` is forwarded to Jupiter's quote request as the same-named query parameter, which leaves the named DEXes out of the quoted route, and is part of the quote cache key.
