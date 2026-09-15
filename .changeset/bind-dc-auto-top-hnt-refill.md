---
"@helium/idls": patch
---

Bind the dc-auto-top HNT refill to the schedule and accounts it was queued for. `AutoTopOffV0` gains `next_task_time` and `next_hnt_task_time`, each leg refuses to run before its recorded time, `top_off_hnt_v0` requires the DCA destination to be the top off's own HNT account, and the DCA swap payer is pinned to the task queue's `dca_swap_payer` custom signer.
