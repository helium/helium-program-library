---
"@helium/spl-utils": minor
"@helium/sus": minor
"@helium/distributor-oracle": patch
"@helium/helium-admin-cli": patch
"@helium/voter-stake-registry-hooks": patch
---

`@helium/spl-utils` now builds v1 transactions when the node and the signer support them. Set `HPL_TX_VERSION` to `v0`, `v1` or `auto` to override the choice. `toVersionedTx` is now async. The batchers pick v1 or v0 for each transaction. The `executeRemoteTxn` family, `executeBig`, `BigInstructionResult`, `sendMultipleInstructions` and `createNft` are no longer exported; `createNft` moved to the tests. `stringToTransaction` and `bufferToTransaction` are deprecated. `createAtaAndMint` and `createAtaAndTransfer` now honour only `commitment` from their `ConfirmOptions`. `@helium/sus` now simulates and prices v1 transactions.
