---
hpl-crons: patch
---

Add the temporary `backfill_entity_claim_wallet_v0` instruction. It adds the owner's whole-wallet claim as transaction 0 of an entity claim cron job that never had a claim (next transaction id 0). Only the prod key `hprdn…` can sign it, and it pays the claim rent. The instruction fails with `CronJobHasClaims` when the cron job has ever had a claim, even if every claim was later removed. No existing instruction, account, or args type changed. Remove the instruction after the backfill has run.
