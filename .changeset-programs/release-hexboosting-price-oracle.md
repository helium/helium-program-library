---
hexboosting: none
price-oracle: none
---

Release the source that reached develop after the last tag of each program. No instruction, account or error changes. `hexboosting` now refuses to compile as a deployable program when TESTING is set without HELIUM_TEST_BUILD, and `boost_v0` drops a redundant pair of parentheses. In `price-oracle`, `calculate_current_price` reads the last submitted timestamp with `is_some_and`; the result is the same. Both programs gain the `anchor-debug` feature.
