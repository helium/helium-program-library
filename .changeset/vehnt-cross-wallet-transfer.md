---
"@helium/blockchain-api": minor
---

Allow veHNT position transfer to a target position owned by another wallet. `positions/transfer` no longer requires the caller to own the target position, matching the on-chain `transferV0` constraint, and adds registrar/voting-mint-config compatibility checks between source and target.
