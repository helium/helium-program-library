---
"@helium/spl-utils": minor
---

Add a measured compute-unit table (`computeUnitTable`) and CU sampler, and use them in `sendInstructionsWithPriorityFee`/transaction building to set tight per-instruction compute budgets instead of fixed limits, reducing CU price paid under SIMD-0553.

New exports for consumers building their own transactions: `estimateComputeBudget`, `prependComputeBudgetIxs`, `setLoadedAccountsDataSizeLimit`, `tableComputeUnitsForInstructions`, `MAX_COMPUTE_UNITS`, `DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT`, and the `COMPUTE_BUDGET_IX_*` instruction discriminants. Also adds `sample-cu` and `check-cu-table` scripts for regenerating and validating the table against real traffic.
