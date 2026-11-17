---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

`getQuote` takes an optional `instructionVersion` (`"V1"` or `"V2"`) and `getInstructions` takes an optional `useSharedAccounts`. Both are forwarded to Jupiter only when set, so a caller that omits them gets the requests it sent before. `instructionVersion: "V2"` makes Jupiter emit `route_v2` / `shared_accounts_route_v2`, and `useSharedAccounts: true` routes through Jupiter's shared program accounts so AMMs never receive the user's authority. A cached quote is keyed by `instructionVersion`, so a quote built without one is never served to a request for `"V2"`.
