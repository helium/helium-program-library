---
"@helium/idls": patch
---

`mini-fanout` holds a pre task to one of two shapes — a remote transaction the Helium oracle
signs, or a compiled transaction carrying no signer seeds — and gains an `InvalidPreTask` error
for anything else.
