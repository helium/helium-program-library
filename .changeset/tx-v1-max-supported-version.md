---
"@helium/spl-utils": patch
"@helium/helium-admin-cli": patch
---

Request `maxSupportedTransactionVersion: 1` on getTransaction / getTransactions / getParsedTransaction(s) calls and bump @solana/web3.js to 1.99.0 so version 1 transactions decode after Agave 4.2.
