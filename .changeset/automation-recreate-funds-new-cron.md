---
"@helium/blockchain-api-service": patch
---

Fund the cron job `createAutomation` re-creates on a schedule change for the whole requested duration at the claim count the old cron job had; claims added afterwards shorten it. The teardown refunds the old cron job, so the new one starts with only its rent; it was priced from the old balance and often got no funding at all, then stood down at its first run. `getFundingEstimate` with a different `schedule` now prices the same re-created cron job, and the wallet balance check counts the old cron job's refund.
