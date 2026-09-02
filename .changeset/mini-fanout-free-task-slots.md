---
"@helium/idls": patch
---

mini-fanout: record `next_pre_task` only when a pre task occupies the second free task slot, and declare `free_tasks` to match the number of tasks a distribution returns. Sum share weights into a `u128`, the width the divisor already uses. Settle what a share member is still owed off the top, the way a fixed payout is settled. Adds a `MissingFreeTask` error.
