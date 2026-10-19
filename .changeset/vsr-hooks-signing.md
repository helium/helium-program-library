---
"@helium/voter-stake-registry-hooks": patch
---

Declare wallet signing with `signing: { feePayer: "wallet" }` on every batcher call, in place of the `version: 0` and `deriveLoadedAccountsDataSizeLimit: false` pins.
