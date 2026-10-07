---
"@helium/sus": patch
---

`@helium/sus` now asks the node to price a v1 transaction and uses its price when it has one. When the node returns no price, the v1 `solFee` counts each ed25519 and secp256k1 precompile signature at the base fee, as well as the message signatures.
