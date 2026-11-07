---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

Add `createWalletClaimAutomation` and `createEntityClaimAutomation`, which set up an automation and add its claims in one signing round. `getFundingEstimate` takes an optional `claims` input to price them. The cron cost per run now counts one schedule task per 5 claims, so funding for crons with 6 or more claims rises slightly (`createAutomation`, `fundAutomation`, `getAutomationStatus`, `getFundingEstimate`). `createAutomation` now declares `BAD_REQUEST` in its contract; it is thrown only by the claim setups, when their transactions do not fit one bundle.
