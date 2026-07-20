# lazy-distributor

An oracle-driven "lazy" rewards distributor. Each recipient is an NFT (typically a hotspot) and a set of oracles attest to a running total of rewards accrued for that NFT. Owners call `distribute_rewards` when they want to actually pull the tokens out, which is cheaper than minting on every epoch.

See the [Oracle Architecture](../../README.md#oracle-architecture) section in the main README for the request/response contract. Reference oracle implementation: [`distributor-oracle`](../../packages/distributor-oracle). SDK: [`@helium/lazy-distributor-sdk`](../../packages/lazy-distributor-sdk).

Release / upgrade: push a `program-lazy-distributor-<version>` git tag.
