---
"@helium/automation-hooks": patch
---

Fund the cron job `useAutomateHotspotClaims` re-creates on a schedule change for the whole requested duration at one claim, the wallet claim the hook adds to the new cron job. The teardown refunds the old cron job, so the new one starts with only its rent; the hook priced it as a top-up from the old balance, often sent no funding at all, and the cron job stood down at its first run. A re-created cron job now gets two crank rewards per run (the cron run and its one claim), plus the task-return funding, and `rentFee` quotes its setup rent, the same as a first setup. A first setup is priced the same way.
