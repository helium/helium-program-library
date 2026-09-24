---
"@helium/idls": patch
"@helium/spl-utils": patch
"@helium/mobile-entity-manager-sdk": patch
---

Add `close_carrier_v0` and `close_incentive_program_v0` to `mobile-entity-manager`, and fix `swap_carrier_stake` to record the escrow it moves the stake to.

A carrier had no way to release its stake. `revoke_carrier_v0` only sets `approved = false`, and `swap_carrier_stake` is a collateral migration rather than a release: it returns the legacy DNT stake and posts `CARRIER_STAKE_AMOUNT` of HNT in the same instruction, so the collateral posted never falls.

`close_carrier_v0` transfers the escrow out, closes it, and closes the `CarrierV0`. It is signed by `sub_dao.authority`, matching approve and revoke, while `destination` is constrained to a token account owned by `carrier.update_authority`, so retiring a carrier cannot move its stake anywhere the carrier does not control. `!carrier.approved` is required. Close every `IncentiveEscrowProgramV0` under a carrier before the carrier itself: they are reached through the `CarrierV0` and cannot be closed once it is gone.

`close_incentive_program_v0` retires an incentive escrow program whose window has passed, signed by `issuing_authority`.

`swap_carrier_stake` previously left `carrier.escrow` naming the account it had just closed, which put the new stake beyond the reach of any instruction that resolves the escrow through that field. It now records the new escrow.
