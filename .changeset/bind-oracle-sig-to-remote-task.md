---
"@helium/distributor-oracle": patch
---

Pass the running tuktuk task to `setCurrentRewardsWrapperV2` as a remaining account. lazy-distributor 0.3.9 requires that task to be a RemoteV0 task signed by the oracle, which binds the oracle signature to the task it was issued for and rejects it under any other task.
