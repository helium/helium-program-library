---
"@helium/spl-utils": minor
"@helium/currency-utils": minor
"@helium/data-credits-sdk": minor
---

Migrate to Pyth pro (sponsored push) HNT price feed. The HNT feed constant now points at the pro feed account `He5mhwVQQNvjFxqjEjFDb7enJWFwFJ7Rq7zknqBz89A5`; Hermes ephemeral price updates are no longer fetched or posted — the `priceUpdates` return field and `PYTH_HERMES_URL` exports are removed. No Pyth configuration is needed by consumers; the returned `{txs}` shape is unchanged.
