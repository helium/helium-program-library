---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

`swap.getInstructions` builds the swap through Jupiter's Swap V2 `GET /swap/v2/build` instead of `POST /swap/v1/swap-instructions`. `/build` quotes the route again for the quote's input mint, output mint, `inAmount` and `slippageBps`, so the transaction metadata and action metadata carry the output amount `/build` returned. The transaction compiles against the lookup tables `/build` resolves. `getInstructions` takes an optional `excludeDexes`, forwarded to `/build` when set, and refuses a quote whose `swapMode` is not `ExactIn` with `BAD_REQUEST`. `useSharedAccounts`, `dynamicComputeUnitLimit` and `prioritizationFeeLamports` are accepted and ignored: `/build` takes no shared-accounts option, and the server sets the compute unit limit and price itself. `swap.getQuote` still quotes through `/swap/v1/quote`.
