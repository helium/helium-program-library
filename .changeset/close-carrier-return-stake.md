---
"@helium/idls": patch
---

Add `close_carrier_v0` and `close_incentive_program_v0` to `mobile-entity-manager`. `revoke_carrier_v0` only sets `approved = false`, and `swap_carrier_stake` returns a stake only by requiring a replacement in the same transaction, so a retired carrier had no way to release its escrow. `close_carrier_v0` transfers the escrow out, closes it and closes the `CarrierV0`. It is signed by `sub_dao.authority`, matching approve and revoke, while `destination` is constrained to a token account owned by `carrier.update_authority`, so retiring a carrier cannot move its stake anywhere the carrier does not control; `!carrier.approved` is required. `close_incentive_program_v0` retires an incentive escrow program whose window has passed, signed by `issuing_authority`.
