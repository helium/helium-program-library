---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Reject a swap quote whose input and output mint are the same. `GetQuoteInput`
now requires the two mints to differ, so the request fails as a 400 before it
reaches Jupiter instead of coming back as a `JUPITER_ERROR` 500 carrying
Jupiter's `CIRCULAR_ARBITRAGE_IS_DISABLED`. Jupiter's client-side error codes
(`CIRCULAR_ARBITRAGE_IS_DISABLED`, `TOKEN_NOT_TRADABLE`) map to `BAD_REQUEST`
for both `swap.getQuote` and `swap.getInstructions`, and the swap UI leaves the
counterpart token out of each picker so the pair can no longer be selected.
