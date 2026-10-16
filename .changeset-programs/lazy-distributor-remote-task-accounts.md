---
lazy-distributor: patch
rewards-oracle: none
welcome-pack: none
---

`set_current_rewards_v1` finds the running task by its key among the remaining accounts, not as the last one, so a task with free tasks passes. It still returns `NotRunningAsTask` when the top-level instruction is not `run_task_v0`. A task key that is not among the remaining accounts now returns `TaskMismatch`.

`distribute_compression_rewards_v0` passes only the proof nodes the tree needs (max depth minus canopy depth) to `verify_leaf`. New error `InvalidMerkleTree`.

`rewards-oracle` changes a comment only. `welcome-pack` links the lazy-distributor crate for CPI only; it does not call the changed instructions.
