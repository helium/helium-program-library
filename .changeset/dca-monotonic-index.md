---
"@helium/idls": patch
---

Seed the dc-auto-top DCA PDA from a per-account `dca_index` instead of a hardcoded `0`, so a DCA that fails to drain and close no longer occupies the slot the next top-off needs. `dca_index` is carved out of `AutoTopOffV0.reserved`, leaving every other field at its existing byte offset.
