---
"@helium/tuktuk-dca-service": patch
---

Bound DCA routes with maxAccounts 20 as well as maxBytes 520, and measure the crank turner's transaction (compute budget, ed25519 check and run_task_v0) before answering. When it is over 1232 bytes, build the swap once more with maxBytes lowered by the overshoot, and refuse the order when it still does not fit.
