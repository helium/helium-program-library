---
"@helium/blockchain-api": patch
"@helium/blockchain-api-service": patch
---

Widen transaction batch tags to TEXT, bound the contract tag at 1000 chars, back off per-batch resubmissions, and clamp migration SOL transfers to the live source balance
