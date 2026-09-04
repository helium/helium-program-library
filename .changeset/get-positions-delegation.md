---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": minor
---

governance.getPositions now returns a `delegation` object per position (null
when not delegated) with the sub-DAO, lastClaimedEpoch, raw expirationTs,
`claimableEpochCount` (epochs claimDelegationRewards would build instructions
for right now) and `unissuedRequiredEpochCount` (epochs undelegatePosition is
waiting on issuance for). The counts come from the same epoch-range and
issuance test the claim builder uses, which now lives in a shared helper.

Note for consumers: web-helium-world currently mirrors this epoch range in
`src/lib/governance/reward-math.ts` (`claimUpperBoundEpoch` /
`delegationExpirationCapEpoch`) and should switch to `claimableEpochCount` /
`unissuedRequiredEpochCount` once it adopts this version.
