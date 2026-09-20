---
"@helium/idls": patch
---

Bind the lazy-distributor RemoteV0 reward path to the running task and the signed reward. `set_current_rewards_v1` recomputes the tuktuk verification hash over the running task, its `queued_at`, and `run_task_v0`'s account list and requires it to equal the oracle-signed hash, then requires the signed transaction to carry an instruction ending in this call's `(oracle_index, current_rewards)`. A signature issued for another task, run over other accounts, or paired with a different amount is rejected. Adds the `RemoteTaskHashMismatch` and `RemoteRewardNotSigned` error codes.
