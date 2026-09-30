---
"@helium/blockchain-api": patch
"@helium/blockchain-api-service": patch
---

Add an optional `schedule` input to `getFundingEstimate`, the same preset or raw crontab `createAutomation` takes. With it, the setup rent prices the cron job at that crontab's length, as `createAutomation` does, so a raw crontab over 15 characters is no longer under-quoted. Without it, the estimate is unchanged and still assumes the longest preset (15 characters).
