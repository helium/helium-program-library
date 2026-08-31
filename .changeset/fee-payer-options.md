---
"@helium/blockchain-api": minor
---

Add a `feePayer` option to `hotspots/update-info` (`"maker"` default, or `"owner"` to build the update here with the owner paying the fee, DC burn, and any mobile_info resize) and an optional third-party `feePayer` to `tokens/transfer` so a drained wallet's transfer can be paid by another account. Also verify delegate signatures and fee payers before the service signs or attributes anything, and require asset ownership on `updateRewardsDestination`, `createSplit`, and `deleteSplit`.
