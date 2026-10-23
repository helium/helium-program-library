---
mini-fanout: patch
welcome-pack: none
---

`schedule_task_v0` and `distribute_v0` fail with `InvalidSchedule` when the fanout's schedule does not parse or has no future time. Before, both cases failed with `InvalidDataIncrease`, and a timestamp out of range panicked. No account or args type changed. `welcome-pack` calls `schedule_task_v0` only through its CPI wrapper, so its binary does not change.
