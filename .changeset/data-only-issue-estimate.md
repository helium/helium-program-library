---
"@helium/blockchain-api-service": patch
---

`issueDataOnlyHotspot` now returns an `estimatedSolFee` of the transaction fee plus the KeyToAssetV0 rent and tree fee, the same costs its funding gate charges, instead of the transaction fee alone.
