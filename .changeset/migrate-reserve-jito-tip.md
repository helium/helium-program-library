---
"@helium/blockchain-api-service": patch
---

`migration.migrate` now packs each mainnet page into at most four transactions and adds the Jito tip as its own transaction. A page that filled all five bundle transactions failed with "Unable to fit Jito tip instruction into the transaction bundle", and every retry failed the same way.
