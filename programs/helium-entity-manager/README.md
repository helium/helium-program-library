# helium-entity-manager

Issues Helium's rewardable entities — IoT hotspots, MOBILE hotspots, Data-Only hotspots, MOBILE subscribers — as compressed NFTs, and gates who can issue them through a `Maker` + `MakerApproval` model. Also owns the "assert location / gain / elevation" instructions that turn a minted entity into a rewardable one.

Every entity produced here ultimately flows into [`helium-sub-daos`](../helium-sub-daos) for reward accounting and into [`lazy-distributor`](../lazy-distributor) for payout.

SDK: [`@helium/helium-entity-manager-sdk`](../../packages/helium-entity-manager-sdk). Metadata: [`metadata-service`](../../packages/metadata-service).

Release / upgrade: push a `program-helium-entity-manager-<version>` git tag.
