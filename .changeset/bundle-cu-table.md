---
"@helium/spl-utils": patch
"@helium/blockchain-api-service": patch
---

Size every Jito bundle producer's compute unit limits from the static CU table.
Standalone simulation cannot see the state earlier transactions in a bundle
leave behind, so a later claim or delegate transaction could exceed its limit
and fail the bundle with `ProgramFailedToComplete`. `buildVersionedTransaction`
and `buildBatchedTransactions` take `useTableComputeUnits`, on by default for
batched builds, and the governance bundle endpoints (claim, delegate,
undelegate, vote, relinquish, proxy assign and unassign, create position) use
it. `tableComputeUnitsForInstructions` gains `throwOnMiss`, so a bundle
carrying an untabled instruction fails the build naming the missing key instead
of quietly requesting 1.4M CU. The table gains mainnet-measured entries for the
nft_proxy, hpl_crons vote-queue and voter_stake_registry expired-vote
instructions, and re-measures `vote_v0` and `relinquish_vote_v1` from mainnet.
