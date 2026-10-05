---
"@helium/automation-hooks": patch
---

Fund the cron job `useAutomateHotspotClaims` re-creates on a schedule change for the whole requested duration. The teardown refunds the old cron job, so the new one starts with only its rent; the hook priced it as a top-up from the old balance, often sent no funding at all, and the cron job stood down at its first run. A re-created cron job now gets one crank reward per run plus the task-return funding, and `rentFee` quotes its setup rent, the same as a first setup.
