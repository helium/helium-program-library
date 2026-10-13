---
"@helium/hpl-crons-sdk": minor
"@helium/idls": patch
"@helium/helium-admin-cli": patch
"@helium/voter-stake-registry-hooks": patch
---

Each task dequeue in `dc_auto_top`, `hpl_crons`, `mini_fanout`, and `tuktuk_dca` now refunds the task's rent to the account the task names as its `rent_refund`. The handler selects that account from the writable accounts of the instruction, then from the remaining accounts, where it must be writable. The account lists of the instructions do not change. Each program has two new errors, `RentRefundAccountMissing` and `RentRefundAccountNotWritable`.

`@helium/hpl-crons-sdk` adds `taskRentRefund(tuktukProgram, task)`. It reads a task and returns its rent refund as one writable remaining account, or an empty list when the task does not exist.

The governance hooks and the admin CLI commands that close or restart a task append that account when the instruction does not have it.
