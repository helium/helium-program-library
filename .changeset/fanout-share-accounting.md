---
"@helium/idls": patch
---

Fanout: fold a vault arrival into the accumulator at the staked-share count in force when it is folded, and seed a new voucher's watermark from `fanout.total_inflow` rather than the token account balance, so joining does not dilute the vouchers already staked. A fold takes as much of an arrival as the accumulator has room for and leaves the rest pending. `unstake_v0` removes `voucher.shares` from `total_staked_shares` and releases what the closing voucher was owed back to the vouchers that remain. `initialize_fanout_v0` starts the accumulator empty, so a balance already in the vault is the first fold's arrival. Adds `TooManyShares`, `InvalidDestination`, `ZeroStake` and `NoShares`.
