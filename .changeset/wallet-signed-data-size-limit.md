---
"@helium/spl-utils": patch
---

Add `deriveLoadedAccountsDataSizeLimit` opt-out to `withPriorityFees` and `batchInstructionsToTxsWithPriorityFee`, and disable sim-derived loaded-accounts-data-size limits on all blockchain-api wallet-signed transactions. Wallets append guard instructions (Lighthouse) after sizing, which exceeded the derived limit and failed with `MaxLoadedAccountsDataSizeExceeded`.
