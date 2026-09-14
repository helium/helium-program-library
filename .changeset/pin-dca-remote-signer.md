---
"@helium/idls": patch
---

Pin the DCA remote task's signer and url. tuktuk-dca and dc-auto-top now reject a `dca_signer` other than the production DCA signer, a `dca_url` that does not address the pinned DCA service, and slippage of a whole 100%. Adds the `InvalidDcaSigner`, `InvalidDcaUrl` and `InvalidSlippage` error codes.
