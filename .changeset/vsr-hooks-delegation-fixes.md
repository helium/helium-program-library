---
"@helium/voter-stake-registry-hooks": patch
---

`useDelegatePositions` now sends the reward claims for expired delegations. Before, it sent an empty batch. It also closes each expired delegation against its own sub-DAO, not the sub-DAO at the filtered index. `useExtendDelegation` no longer passes the helium-sub-daos IDL to the proxy and VSR programs.
