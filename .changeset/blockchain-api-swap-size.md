---
"@helium/blockchain-api-service": patch
---

Bound Jupiter `/build` routes (maxAccounts 40, maxBytes 1080) so swaps fit one transaction, and refuse a swap that is still too large with JUPITER_ERROR instead of returning an unsendable transaction.
