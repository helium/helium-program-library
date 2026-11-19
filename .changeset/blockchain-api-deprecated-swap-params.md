---
"@helium/blockchain-api": patch
"@helium/blockchain-api-service": patch
---

Mark the ignored getInstructions inputs (dynamicComputeUnitLimit, useSharedAccounts, prioritizationFeeLamports) as deprecated, drop the default on dynamicComputeUnitLimit, and log the user agent of callers that still send them.
