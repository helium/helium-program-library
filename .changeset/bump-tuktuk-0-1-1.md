---
"@helium/automation-hooks": minor
"@helium/distributor-oracle": minor
"@helium/helium-admin-cli": minor
"@helium/hpl-crons-sdk": minor
"@helium/voter-stake-registry-hooks": minor
"@helium/welcome-pack-sdk": minor
---

Bump @helium/tuktuk-sdk, @helium/tuktuk-idls and @helium/cron-sdk to ^0.1.1, matching the
tuktuk 0.2.10 and cron 0.3.1 programs deployed to mainnet in August 2026. The new IDLs decode
the error codes those releases added and expose queueCronTasksV1 / requeueCronTaskV1.

`nextAvailableTaskIds` now takes the task queue's `capacity` as a required fourth argument
(and `random` as the third) so it never returns an id in the bitmap's padding bits past
capacity, which the program rejects with InvalidTaskId once a queue is nearly full. Every
call site passes the fetched TaskQueueV0's capacity. `@helium/hpl-crons-sdk` no longer
ships its own two-argument copy; it re-exports the tuktuk-sdk function.
