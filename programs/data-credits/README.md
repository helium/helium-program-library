# data-credits

Manages Data Credits (DC) — a non-transferable SPL token that hotspots and routers burn to pay for packet delivery. Burning HNT through this program mints DC at the oracle-attested HNT price; burning DC for data-transfer reports back to [`helium-sub-daos`](../helium-sub-daos) so the sub-DAO that produced the utility is credited.

SDK: [`@helium/data-credits-sdk`](../../packages/data-credits-sdk).

Release / upgrade: push a `program-data-credits-<version>` git tag.
