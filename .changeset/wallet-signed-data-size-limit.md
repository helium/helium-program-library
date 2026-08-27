---
"@helium/blockchain-api": patch
"@helium/spl-utils": patch
"@helium/distributor-oracle": patch
"@helium/voter-stake-registry-hooks": patch
---

Add `deriveLoadedAccountsDataSizeLimit` opt-out to `withPriorityFees` and `batchInstructionsToTxsWithPriorityFee`, and disable sim-derived loaded-accounts-data-size limits on wallet-signed transactions in blockchain-api, distributor-oracle, and voter-stake-registry-hooks. Wallets append guard instructions (Lighthouse) after sizing, which exceeded the derived limit and failed with `MaxLoadedAccountsDataSizeExceeded`.
