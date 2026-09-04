---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

governance.getPositions now returns a `delegation` object per position (null
when not delegated) with the sub-DAO, lastClaimedEpoch, raw expirationTs,
`claimableEpochCount` (epochs claimDelegationRewards would build instructions
for right now), `requiredUnclaimedEpochCount` (unclaimed epochs
close_delegation_v0 requires, issued or not) and `unissuedRequiredEpochCount`
(the subset of those undelegatePosition is waiting on issuance for). The counts
come from the same epoch-range and issuance test the claim builder uses, which
now lives in a shared helper.

The issuance test now gates HNT-era epochs on `DaoEpochInfoV0.doneIssuingRewards`
(what claim_rewards_v1 checks) instead of the per-sub-DAO `rewardsIssuedAt`,
which is set before the last sub-DAO has issued. Claims built in that window
used to fail on-chain with EpochNotClosed.

Note for consumers: web-helium-world currently mirrors this epoch range in
`src/lib/governance/reward-math.ts` (`claimUpperBoundEpoch` /
`payableUpperBoundEpoch`) and should switch to `claimableEpochCount` /
`unissuedRequiredEpochCount` once it adopts this version.
