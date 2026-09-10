---
"@helium/idls": patch
---

mini-fanout: `distribute_v0` fails with a new `BelowRentExempt` error when the fanout sits under the current rent minimum, so the task stays queued and resumes once it is topped up, and crank reward math is overflow-checked.
