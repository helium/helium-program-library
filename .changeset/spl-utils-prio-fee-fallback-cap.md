---
"@helium/spl-utils": patch
---

Cap the `getRecentPrioritizationFees` fallback of `estimatePrioritizationFee` at `maxPriorityFee`, as the `getPriorityFeeEstimate` path already does.
