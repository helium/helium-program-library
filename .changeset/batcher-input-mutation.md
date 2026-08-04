---
"@helium/spl-utils": patch
---

Fix batchInstructionsToTxsWithPriorityFee mutating the caller's instruction group arrays when starting a new transaction after overflow, which corrupted groups across repeated batch calls and produced oversized transactions. Also catch simulateTransaction rejections in estimateComputeUnits and fall back to max compute units instead of propagating the error.
