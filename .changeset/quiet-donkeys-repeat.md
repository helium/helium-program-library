---
"@helium/idls": patch
---

Queue-returned tasks carry the task queue's minimum crank reward. `hpl-crons`
gains a `TooManyFreeTasks` error, and `tuktuk-dca` drops `crank_reward` from
`InitializeDcaArgsV0` and from the `DcaV0` account.
