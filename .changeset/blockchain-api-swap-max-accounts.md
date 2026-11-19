---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": patch
---

`swap.getQuote` and `swap.getInstructions` send `maxAccounts=60` to Jupiter's `/swap/v2/build`, so the quoted route and the built route are drawn from the same bound and leave the transaction room for the compute budget instructions the server adds. `swap.getInstructions` measures the serialized transaction, signature slots included, against Solana's 1232-byte packet limit. A transaction over it is built again with `maxAccounts` lowered by 3 (57, 54, 51), up to 3 times, and each requote still has to clear the quote's minimum output. A route that stays over the limit is refused with the new `TRANSACTION_TOO_LARGE` error (HTTP 422) instead of being returned unsendable. `/build` is requested at most 8 times per call: 4 values of `maxAccounts`, each with the existing one-retry minimum-output check.
