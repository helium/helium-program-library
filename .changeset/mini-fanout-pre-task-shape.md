---
"@helium/idls": patch
---

`mini-fanout` queues a pre task only when it is one of two shapes: a remote transaction the
Helium oracle signs, or a compiled transaction carrying no signer seeds. Anything else fails
with a new `InvalidPreTask` error.
