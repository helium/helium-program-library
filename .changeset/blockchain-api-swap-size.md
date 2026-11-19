---
"@helium/blockchain-api-service": patch
---

Bound Jupiter `/build` routes (maxAccounts 40, maxBytes 1080) so swaps fit one transaction with 100 bytes left for wallet guard instructions. A swap over 1132 bytes is built once more with maxBytes lowered by the overshoot; if that is still too large, getInstructions refuses it with JUPITER_ERROR instead of returning an unsendable transaction. Governance batches share the same 100-byte wallet guard reserve.
