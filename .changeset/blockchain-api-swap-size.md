---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": patch
---

Bound Jupiter `/build` routes (maxAccounts 40, maxBytes 1080) so swaps fit one transaction with 100 bytes left for wallet guard instructions. A swap over 1132 bytes is built once more with maxBytes lowered by the exact overshoot, counted from the message even past the packet limit. If that is still too large, or Jupiter finds no route inside the lower bound, getInstructions refuses it with the new TRANSACTION_TOO_LARGE error (422) instead of returning an unsendable transaction. Other retry failures keep their own error. Governance batches share the same 100-byte wallet guard reserve.
