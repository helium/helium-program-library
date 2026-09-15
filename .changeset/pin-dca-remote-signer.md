---
"@helium/idls": patch
---

Pin the DCA remote task's signer and url. tuktuk-dca and dc-auto-top now reject a `dca_signer` other than the production DCA signer, a `dca_url` other than the pinned DCA service url, and slippage of a whole 100%. Adds the `InvalidDcaSigner`, `InvalidDcaUrl` and `InvalidSlippage` error codes.
