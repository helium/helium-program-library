# lazy-transactions

Commits a Merkle root of pre-authorised transactions on-chain and lets anyone execute any leaf by presenting the proof. We pre-compute the enormous set of migration transactions off-chain, publish only the root, and then users (or a cranker) execute the one relevant to them.

Used by [`migration-service`](../../packages/migration-service) for the HNT L1 → Solana migration and by welcome-pack issuance. SDK: [`@helium/lazy-transactions-sdk`](../../packages/lazy-transactions-sdk).

Release / upgrade: push a `program-lazy-transactions-<version>` git tag.
