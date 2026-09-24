# lazy-distributor

An oracle-driven "lazy" rewards distributor. Each recipient is an NFT (typically a hotspot) and a set of oracles attest to a running total of rewards accrued for that NFT. Owners call `distribute_rewards` when they want to actually pull the tokens out, which is cheaper than minting on every epoch.

See the [Oracle Architecture](../../README.md#oracle-architecture) section in the main README for the request/response contract. Reference oracle implementation: [`distributor-oracle`](../../packages/distributor-oracle). SDK: [`@helium/lazy-distributor-sdk`](../../packages/lazy-distributor-sdk).

Release / upgrade: add a program changeset that names `lazy-distributor` in [`.changeset-programs/`](../../.changeset-programs). The bots bump the version, push `program-lazy-distributor-<version>`, and open the Squads proposal. See [CI / deployment overview](../../README.md#ci--deployment-overview).
