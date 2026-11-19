---
"@helium/blockchain-api-service": patch
---

Bound Jupiter `/build` routes (maxAccounts 40, maxBytes 1080) so swaps fit one transaction with 100 bytes left for wallet guard instructions, and refuse a swap over 1132 bytes with JUPITER_ERROR instead of returning an unsendable transaction.
