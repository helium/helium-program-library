---
"@helium/voter-stake-registry-hooks": patch
---

`formPositionClaims` now skips epochs the program would reject (not over, rewards not issued, or no delegation rewards), so the other claims land; closing a delegation still needs every epoch up to the close bound claimed. `useExtendDelegation` and the extend and change branches of `useDelegatePositions` now build the closing, genesis-end and season accounts the program expects, using the registrar's time offset. `useCreatePosition` throws when no season covers the current time instead of building a delegation that cannot land.
