---
"@helium/idls": patch
"@helium/helium-admin-cli": patch
---

Price the DCA repay floor in output minor units. `DcaV0` now records `input_decimals` and `output_decimals` (taken from the two reserved bytes), and `check_repay_v0` scales the oracle price ratio by the mint decimal difference as well as the Pyth exponent difference. `check_repay_v0` also requires that it is running inside the DCA's own tuktuk task. `close_dca_v0` no longer parses the recorded task, so a DCA whose task is gone can still be closed, and it refuses while a swap is in flight. dc-auto-top gains `close_dca_v0` for the DCAs its HNT refill leg creates, reachable from the new `close-auto-top-off-dca` admin command. Adds the `MissingNextTask` and `SwapInProgress` error codes to tuktuk-dca and `InvalidDcaAuthority` to dc-auto-top.
