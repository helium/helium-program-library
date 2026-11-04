---
"@helium/blockchain-api-service": patch
---

Reserve room for the Jito tip when `migration.migrate` packs a page on mainnet. A page that filled all five bundle transactions failed with "Unable to fit Jito tip instruction into the transaction bundle", and every retry failed the same way.
