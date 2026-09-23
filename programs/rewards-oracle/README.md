# rewards-oracle

Thin wrapper around [lazy-distributor](../lazy-distributor) that is meant to eliminate issues where the oracle trusts the RPC. Oracle must lookup the association between an NFT and the KeyToAssetV0. This program verifies that relationship on-chain so the RPC cannot meddle.

SDK: [`@helium/rewards-oracle-sdk`](../../packages/rewards-oracle-sdk). Oracle server: [`distributor-oracle`](../../packages/distributor-oracle).

Release / upgrade: add a program changeset that names `rewards-oracle` in [`.changeset-programs/`](../../.changeset-programs). After the change reaches `master`, push the `program-rewards-oracle-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
