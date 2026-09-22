---
"@helium/idls": patch
---

Run a DCA's swap through tuktuk-dca rather than as an instruction `run_task_v0` invokes directly. `run_task_v0` reads the return data slot after each instruction it invokes and, when the program it invoked is the one that set it, requires the bytes to be a `RunTaskReturnV0`; a Jupiter route sets its own eight-byte out-amount, so a route invoked directly fails the run with `BorshIoError` after the swap has already executed. The new `swap_v0` CPIs a callee pinned by address, which makes the swap program a child whose return data `run_task_v0` ignores, leaving `check_repay_v0` as the only return the run makes. Adds the `swap_v0` instruction.
