---
"@helium/helium-admin-cli": patch
---

`create-dao` and `create-data-only-config` now round the stored `new_tree_fee_lamports` up, as `issue_data_only_entity_v0` does when it derives the tree fee, instead of down.
