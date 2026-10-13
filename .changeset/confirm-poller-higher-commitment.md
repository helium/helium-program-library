---
"@helium/account-fetch-cache": patch
---

`TransactionCompletionQueue.wait` now resolves when the node reports a commitment at or above the one requested (for example `finalized` for a wait at `confirmed`), instead of polling until it times out. The deprecated aliases now map to the level they name (`recent` to `processed`; `single` and `singleGossip` to `confirmed`; `root` and `max` to `finalized`), so a wait at an alias, such as the `recent` default of `awaitTransactionSignatureConfirmation` in `@helium/spl-utils`, resolves from the status poll instead of only from the websocket.
