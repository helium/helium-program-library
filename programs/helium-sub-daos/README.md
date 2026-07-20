# helium-sub-daos

The rewards + governance engine for the Helium network. Maintains the `DAO` (HNT) and each `SubDAO` (IoT, MOBILE), tracks epoch state, and holds the rules for how HNT issuance is split between subnets based on utility score (DC burned) and activity (rewardable entities).

Other programs CPI into this on every meaningful network event: [`data-credits`](../data-credits) reports DC burned, [`helium-entity-manager`](../helium-entity-manager) reports new rewardable entities, [`voter-stake-registry`](../voter-stake-registry) contributes veHNT-weighted voting power.

SDK: [`@helium/helium-sub-daos-sdk`](../../packages/helium-sub-daos-sdk).

Release / upgrade: push a `program-helium-sub-daos-<version>` git tag.
