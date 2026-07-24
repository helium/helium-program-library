---
"@helium/automation-hooks": patch
---

Drop the hardcoded 500k compute-unit limit in `useAutomateHotspotClaims`; limits now come from spl-utils' measured compute-unit table.
