---
"@helium/spl-utils": minor
"@helium/sus": minor
"@helium/distributor-oracle": patch
"@helium/helium-admin-cli": patch
"@helium/voter-stake-registry-hooks": patch
"@helium/account-fetch-cache": patch
---

`@helium/spl-utils` now builds v1 transactions when the node and a keypair-backed signer support them. Wallet adapters stay on v0 unless a per-call `version` or `HPL_TX_VERSION` forces a version. `setWalletSignedTxVersionCeiling` accepts only 0 and throws on 1, because web3.js 1.x cannot serialize a v1 transaction that a wallet adapter signed. Set `HPL_TX_VERSION` to `v0`, `v1` or `auto` to override the choice. Any other `HPL_TX_VERSION` value throws. `toVersionedTx` is now async. The batchers pick v1 or v0 for each transaction. Both batchers now throw when a single instruction group fits in no transaction version, instead of sending an oversize transaction. The `executeRemoteTxn` family, `executeBig`, `BigInstructionResult`, `sendMultipleInstructions` and `createNft` are no longer exported; `createNft` moved to the tests. `stringToTransaction` and `bufferToTransaction` are deprecated. `createAtaAndMint` and `createAtaAndTransfer` now honour only `commitment` from their `ConfirmOptions`. `mintTo`, `createMint` and `createAtaAndMint` now send through `sendInstructions` with preflight skipped. `@helium/sus` now simulates and prices v1 transactions. `TransactionCompletionQueue` now removes its websocket signature subscription when a confirmation wait resolves, fails or times out, instead of leaving it open on the shared connection. `bulkSendTransactions` and `bulkSendRawTransactions` no longer resend a transaction with an unsigned required signer until expiry. They send the signed ones, then throw "Missing signature for public key …". When an on-chain failure or blockhash expiry ends the call first, its error also names the missing signers found so far.
