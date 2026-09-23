# data-credits

Manages Data Credits (DC) — a non-transferable SPL token that hotspots and routers burn to pay for packet delivery. Burning HNT through this program mints DC at the oracle-attested HNT price; burning DC for data-transfer reports back to [`helium-sub-daos`](../helium-sub-daos) so the sub-DAO that produced the utility is credited.

SDK: [`@helium/data-credits-sdk`](../../packages/data-credits-sdk).

Release / upgrade: add a program changeset that names `data-credits` in [`.changeset-programs/`](../../.changeset-programs). After the change reaches `master`, push the `program-data-credits-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
