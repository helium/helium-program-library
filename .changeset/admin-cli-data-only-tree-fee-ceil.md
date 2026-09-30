---
"@helium/helium-admin-cli": patch
---

`create-data-only-config` now rounds the stored `new_tree_fee_lamports` up, as `issue_data_only_entity_v0` does when it derives the tree fee, instead of down.
