---
"@helium/monitor-service": patch
---

Add dc-auto-top liveness and DCA-input gauges to monitor-service. `solana_auto_top_off_task_trigger{name,leg}` reports the trigger time of the tuktuk task each leg points at, or 0 when none is scheduled, so `time() - value` detects a leg that has stopped rescheduling itself whatever the cause. Alongside the `dc` and `hnt` legs there is a `dca` leg for the DCA the HNT leg funds, whose series is dropped once that DCA has no orders left. The auto-top-off USDC balances and the USDC/USD pyth feed publish time are now exported too, covering the two inputs the HNT leg's DCA depends on.
