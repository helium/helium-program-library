---
"@helium/helium-admin-cli": patch
---

Drop the hardcoded 500k compute-unit limits from `create-council-fanout`, `queue-hotspot-claims`, `queue-position-claims`, and `requeue-hotspot-claims`; limits now come from spl-utils' measured compute-unit table, so these commands stop paying for CU they never use.
