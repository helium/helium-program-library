---
"@helium/voter-stake-registry-hooks": patch
---

`HeliumVsrStateProvider` now recomputes position metadata when `now` or the proxy config changes. Before, decay, delegation expiry and the current season stayed stale until the positions changed.
