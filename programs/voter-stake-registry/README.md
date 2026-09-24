# voter-stake-registry

Helium's fork of [Mango's VSR](https://github.com/blockworks-foundation/voter-stake-registry). Holds HNT positions with optional lockups, computes voting power as a function of stake × lockup multiplier, and feeds that power into `helium-sub-daos` governance. Supports proxied voting so positions can delegate their vote to another wallet without transferring the position.

Position NFTs' metadata comes from [`vsr-metadata-service`](../../packages/vsr-metadata-service). React bindings: [`@helium/voter-stake-registry-hooks`](../../packages/voter-stake-registry-hooks). SDK: [`@helium/voter-stake-registry-sdk`](../../packages/voter-stake-registry-sdk).

Release / upgrade: add a program changeset that names `voter-stake-registry` in [`.changeset-programs/`](../../.changeset-programs). The bots bump the version, push `program-voter-stake-registry-<version>`, and open the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
