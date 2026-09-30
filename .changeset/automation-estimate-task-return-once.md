---
"@helium/blockchain-api-service": patch
---

Count the 0.01 SOL task-return funding once for a first-time automation: `getFundingEstimate` and `getAutomationStatus` no longer add it to `rentFee`, since the cron job funding already carries it. `totalSolNeeded` drops by 0.01 SOL for wallets without an automation; estimates for existing automations are unchanged.
