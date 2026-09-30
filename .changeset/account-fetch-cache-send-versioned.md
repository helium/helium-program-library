---
"@helium/account-fetch-cache": patch
---

The wrapped `sendTransaction` now requeries the accounts a `VersionedTransaction` writes, instead of logging a `TypeError` and skipping the requery.
