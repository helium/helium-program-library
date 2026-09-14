---
"@helium/idls": patch
---

`EpochTrackerV0` gains a `task_queue` field naming the tuktuk queue allowed to advance its epoch, `queue_end_epoch` requires the passed queue to match it, `init_epoch_tracker` takes the queue, and `update_epoch_tracker` can set it.
