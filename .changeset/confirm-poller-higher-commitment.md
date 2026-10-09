---
"@helium/account-fetch-cache": patch
---

`TransactionCompletionQueue.wait` now resolves when the node reports a commitment at or above the one requested (for example `finalized` for a wait at `confirmed`), instead of polling until it times out.
