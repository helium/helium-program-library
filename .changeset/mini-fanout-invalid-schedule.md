---
"@helium/idls": patch
---

mini-fanout `schedule_task_v0` and `distribute_v0` fail with `InvalidSchedule` when the fanout's schedule does not parse or has no future time. Before, both cases failed with `InvalidDataIncrease`.
