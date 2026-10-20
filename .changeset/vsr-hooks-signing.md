---
"@helium/voter-stake-registry-hooks": patch
---

Declare wallet signing with `signing: WALLET_SIGNED` on every priority-fee batcher call, in place of the `version: 0` and `deriveLoadedAccountsDataSizeLimit: false` pins. Behaviour change: these hooks pinned only `version: 0` and still derived a loaded-accounts data size limit; they no longer derive one, so a wallet that appends guard instructions cannot push them past the limit: `useAssignProxies`, `useClaimAllPositionsRewards`, `useClaimPositionRewards`, `useDelegatePosition` (3 calls), `useUnassignProxies`, `useUndelegatePosition`.
