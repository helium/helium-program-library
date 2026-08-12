---
"@helium/idls": patch
---

`helium-sub-daos`, `mini-fanout`, `helium-entity-manager` and `welcome-pack` build their errors
only where they are raised. An `AnchorError` owns its name and message as `String`s, so passing
one to `ok_or` allocates on every call rather than only on the ones that fail, and the heap a
program runs on never gives that memory back.
