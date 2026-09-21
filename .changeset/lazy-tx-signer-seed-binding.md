---
"@helium/idls": patch
---

Reject trailing instructions re-labelled as signer seeds in lazy-transactions `execute_transaction_v0`. Every caller-supplied signer seed set must derive an address the transaction actually uses, and seeds that do not derive a program address are a typed error rather than a panic. Adds the `InvalidSignerSeeds` and `UnusedSignerSeeds` error codes.
