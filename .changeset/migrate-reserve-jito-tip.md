---
"@helium/blockchain-api-service": patch
---

`migration.migrate` now packs each mainnet page into at most four transactions and adds the Jito tip as its own transaction. A page that filled all five bundle transactions failed with "Unable to fit Jito tip instruction into the transaction bundle", and every retry failed the same way.

The tip transaction's metadata is now `type: "jito_tip"` with description "Jito bundle tip". It was `type: "migration"` with "Migration: Jito tip". The source wallet signs the tip as a read-only signer, not through a 0-lamport self-transfer. `signers` stays `["source"]`.
