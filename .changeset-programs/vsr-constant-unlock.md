---
voter-stake-registry: patch
data-credits: none
dc-auto-top: none
helium-entity-manager: none
helium-sub-daos: none
hexboosting: none
hpl-crons: none
mobile-entity-manager: none
rewards-oracle: none
---

`withdraw_v0` no longer releases tokens from a Constant lockup position after its `end_ts`. A Constant position stays locked until the owner resets it to Cliff and the Cliff period ends. Cliff and None positions unlock as before. The dependent programs pick up the change through the `voter-stake-registry` crate, but none of them calls `amount_unlocked` or `amount_locked`, so their binaries do not change behavior.
