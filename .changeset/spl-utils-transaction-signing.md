---
"@helium/spl-utils": minor
---

Add a `signing` option (`{ feePayer: "wallet" | "keypair"; coSigners? }`) to `withPriorityFees`, the batchers and `sendInstructionsWithPriorityFee`; it decides the transaction version and whether the loaded-accounts data size limit is derived, `deriveLoadedAccountsDataSizeLimit` is deprecated, and the packer no longer scales the table CU bound by `computeScaleUp`.
