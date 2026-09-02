# fanout

Splits revenue that lands in a shared token account across staked membership positions. Holders stake membership tokens to mint a voucher NFT, collect distributions against that voucher, and burn the voucher to withdraw their stake.

Used for multi-party revenue splits where each participant's share is transferable. For small, fixed splits prefer the cheaper [mini-fanout](../mini-fanout).

## How a distribution is sized

`fanout.total_inflow` is a lifetime accumulator scaled to the full share base, `fanout.last_snapshot_amount` is the vault balance already folded into it, and each voucher carries a watermark in the same unit. `distribute_v0` pays a voucher the accumulator's growth since that watermark, times the voucher's fraction of `total_shares`.

Revenue is split across **staked** shares, not across all shares. Every arrival is scaled by `total_shares / total_staked_shares`, so the staked vouchers together take all of it and unstaked shares take none. A voucher holding a tenth of `total_shares` while it is the only staked position receives the whole arrival, not a tenth of it.

## Behaviour to know before building on this

- **Joining does not dilute the vouchers already staked.** `stake_v0` folds the pending balance into the accumulator at the previous staked-share count before the new shares join.
- **Unstaking forfeits to the vouchers that remain.** A voucher closes without collecting what it is owed, and `unstake_v0` releases that amount back so the next fold pays it to the vouchers still staked. Collect first if you want it yourself.
- **Revenue that arrives before the first stake goes to the first staker.** With nothing staked there is no share count to scale by, so the balance waits for the first fold. That includes a balance already sitting in the vault when `initialize_fanout_v0` runs. Stake before pointing revenue at the vault.
- **An arrival is folded only as far as the accumulator has room for.** The snapshot advances by exactly the part that was folded and the remainder stays pending, so the fold is callable at every share ratio rather than refusing once the scaling grows large.
- **`total_shares` is fixed** at the membership mint's supply when `initialize_fanout_v0` runs, and that supply must be non-zero. Staked shares in aggregate cannot exceed it, and `stake_v0` returns `TooManyShares` for a stake that would. Minting more membership tokens does not raise the cap, though tokens minted later can be staked while the aggregate stays under it.
- **A stake is at least one share.** `stake_v0` returns `ZeroStake` otherwise, so every voucher in the membership collection is a real position.
- **`fanout.authority` is stored at creation and never read again.** `initialize_fanout_v0` sends the collection NFT to that account's associated token account; after that, no instruction consults the field. There is no admin, no pause, and no route for tokens to leave the vault except `distribute_v0`, which will not pay into the vault itself.
- **Dust below one token per distribution is carried** on the voucher in `total_dust` at twelve extra decimal places and paid out once it reaches a whole unit.

SDK: [`@helium/fanout-sdk`](../../packages/fanout-sdk). Metadata: [`fanout-metadata-service`](../../packages/fanout-metadata-service).

Release / upgrade: push a `program-fanout-<version>` git tag.

Note that this isn't actively used (at least by helium) anymore since HST went away.
