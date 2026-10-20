---
"@helium/helium-admin-cli": patch
---

`sendInstructionsOrSquadsV4` sends the instructions directly when no multisig is given. Before, the guard tested the `@sqds/multisig` import, which is always set.
