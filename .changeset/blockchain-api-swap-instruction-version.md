---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

`getInstructions` takes an optional `useSharedAccounts`, forwarded to Jupiter only when set, so a caller that omits it sends the request it sent before. `useSharedAccounts: true` builds the route through Jupiter's shared program accounts, so no AMM receives the user's authority.
