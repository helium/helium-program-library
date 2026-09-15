---
"@helium/idls": patch
---

Remove the finished migration instructions and their hardcoded authority from helium-sub-daos (`temp_update_sub_dao_epoch_info`, `temp_backfill_dao_recent_proposals`, `temp_claim_buggy_rewards`), helium-entity-manager (`temp_backfill_mobile_info`), lazy-distributor (`temp_update_matching_destination`) and voter-stake-registry (`temp_release_position_v0`). The IDLs for those four programs no longer expose these instructions.
