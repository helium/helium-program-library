# mobile-entity-manager

Carrier / subscriber management for the MOBILE subnet. Registers mobile carriers, approves the incentive programs they run, and mints subscriber entities that can earn rewards for bringing devices onto the network.

Works in tandem with [`helium-entity-manager`](../helium-entity-manager) (which owns hotspot issuance) and [`helium-sub-daos`](../helium-sub-daos) (which owns reward accounting).

SDK: [`@helium/mobile-entity-manager-sdk`](../../packages/mobile-entity-manager-sdk).

Release / upgrade: push a `program-mobile-entity-manager-<version>` git tag.
