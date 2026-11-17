---
"@helium/tokens-to-rent-service": minor
---

The tokens-to-rent service prices and builds its swaps through Jupiter's Swap V2 `GET /swap/v2/build` instead of `/v1/quote` and `POST /swap/v1/swap-instructions`, and no longer depends on `@jup-ag/api`. `JUPITER_URL` is now the API's base URL and defaults to `https://lite-api.jup.ag`; a deployment that sets it to a `/v6` path must change it. The fee-funding swap is bounded with `maxAccounts=20` and `maxBytes=950`, a budget that keeps the transaction under 1232 bytes, in place of `onlyDirectRoutes`, which `/build` does not take. `JUPITER_FEE_BPS` needs `JUPITER_FEE_ACCOUNT` to be set. A `/build` answer that fails validation, swaps other mints or another amount than requested, or carries `otherInstructions` is refused. The transaction asks for a compute unit limit of 1,400,000, since `/build` returns the unit price only. The package gains a `test` script for its unit tests.
