---
"@helium/blockchain-api-service": patch
---

Count the 0.01 SOL task-return funding once for a first-time automation: `getFundingEstimate` and `getAutomationStatus` no longer add it to `rentFee`, since the cron job funding already carries it. `totalSolNeeded` drops by 0.01 SOL for wallets without an automation. The reserve is now held back until the cron program owns `task_return_account_1`, not merely until the account exists. For an existing cron job whose task-return account is still system-owned (it has not completed a run yet), 0.01 SOL of the cron balance no longer counts as claim funding. `getAutomationStatus` reports fewer remaining claims for it. When its cron balance is below rent plus 0.01 SOL, `getFundingEstimate` and `fundAutomation` add the gap, so `totalSolNeeded` and the cron transfer rise by up to 0.01 SOL; otherwise `totalSolNeeded` does not rise. Other existing automations are unchanged.

`getAutomationStatus` now prices `recipientFee` the way `getFundingEstimate` does, instead of the full recipient rent, which the PDA wallet funding in operationalSol already carries when the wallet lacks it, so its `rentFee`, `recipientFee` and `operationalSol` sum to the estimate's `totalSolNeeded` at duration 0.
