---
"@helium/crons": patch
---

Submit oracle prices through `sendInstructionsWithPriorityFee` instead of `.rpc({ skipPreflight: true })`, so `set-oracle-prices` gets a priority fee and a measured compute-unit budget rather than the runtime default.
