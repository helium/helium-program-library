---
"@helium/spl-utils": patch
---

`batchParallelInstructionsWithPriorityFee` now passes `extraSigners` to the batcher, so it signs each transaction with the extra signers its instructions need.
