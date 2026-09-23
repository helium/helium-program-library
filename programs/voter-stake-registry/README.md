# voter-stake-registry

Helium's fork of [Mango's VSR](https://github.com/blockworks-foundation/voter-stake-registry). Holds HNT positions with optional lockups, computes voting power as a function of stake × lockup multiplier, and feeds that power into `helium-sub-daos` governance. Supports proxied voting so positions can delegate their vote to another wallet without transferring the position.

Position NFTs' metadata comes from [`vsr-metadata-service`](../../packages/vsr-metadata-service). React bindings: [`@helium/voter-stake-registry-hooks`](../../packages/voter-stake-registry-hooks). SDK: [`@helium/voter-stake-registry-sdk`](../../packages/voter-stake-registry-sdk).

Release / upgrade: add a program changeset that names `voter-stake-registry` in [`.changeset-programs/`](../../.changeset-programs), and bump `version` in `programs/voter-stake-registry/Cargo.toml`. After the change reaches `master`, push the `program-voter-stake-registry-<version>` tag by hand. The tag's run opens the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
