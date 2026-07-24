---
"@helium/spl-utils": minor
---

Add a measured compute-unit table (`computeUnitTable`) and CU sampler, and use them in `sendInstructionsWithPriorityFee`/transaction building to set tight per-instruction compute budgets instead of fixed limits, reducing CU price paid under SIMD-0553.
