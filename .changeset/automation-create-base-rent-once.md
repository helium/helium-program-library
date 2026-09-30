---
"@helium/blockchain-api": patch
"@helium/blockchain-api-service": patch
---

Charge the setup rent once on a first-time `createAutomation`. The cron job transfer no longer carries the base rent that `init_entity_claim_cron_v0` already takes from the wallet, so a first setup moves that much less SOL. `createAutomation` now prices its transfers and balance check with the same helper as `getFundingEstimate`.

Count the task queue's min crank reward that `init_entity_claim_cron_v0` pays its schedule task. `getFundingEstimate`, `getAutomationStatus` and `createAutomation` add it to `rentFee` (and so to `totalSolNeeded`, the balance check and `estimatedSolFee`) when the wallet has no automation yet; existing automations are unchanged.
