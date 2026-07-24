---
"@helium/blockchain-api": minor
---

Governance vote-building now reports skipped positions instead of silently dropping them. The vote response gains a `skipped: [{ positionMint, reason }]` array (reasons `maxChoicesReached` and `alreadyVotedThisChoice`), and the all-positions-skipped case throws a new `ALL_POSITIONS_SKIPPED` error carrying the same skip report. Additive change — existing consumers keep working.
