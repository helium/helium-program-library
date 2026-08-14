---
"@helium/helium-sub-daos-sdk": patch
---

Flip the helium-sub-daos HIP 149 backstop feed pin (`HNT_PYTH_PRICE_FEED`) from the legacy HNT feed account to the pro feed account `He5mhwVQQNvjFxqjEjFDb7enJWFwFJ7Rq7zknqBz89A5`. Program-side change: `calculate_utility_score_v0` now hard-requires the pro feed account (wrong key is `InvalidPriceOracle` and halts epoch issuance), so the program upgrade and the end-epoch cron's forwarded account must move together.
