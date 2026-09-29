---
"@helium/anchor-resolvers": minor
"@helium/automation-hooks": minor
"@helium/circuit-breaker-sdk": minor
"@helium/data-credits-sdk": minor
"@helium/dc-auto-top-sdk": minor
"@helium/distributor-oracle": minor
"@helium/fanout-sdk": minor
"@helium/helium-admin-cli": minor
"@helium/helium-entity-manager-sdk": minor
"@helium/helium-react-hooks": minor
"@helium/helium-sub-daos-sdk": minor
"@helium/hexboosting-sdk": minor
"@helium/hotspot-utils": minor
"@helium/hpl-crons-sdk": minor
"@helium/idls": minor
"@helium/lazy-distributor-sdk": minor
"@helium/lazy-transactions-sdk": minor
"@helium/mini-fanout-sdk": minor
"@helium/mobile-entity-manager-sdk": minor
"@helium/no-emit-sdk": minor
"@helium/price-oracle-sdk": minor
"@helium/rewards-oracle-sdk": minor
"@helium/spl-utils": minor
"@helium/sus": minor
"@helium/treasury-management-sdk": minor
"@helium/tuktuk-dca-sdk": minor
"@helium/voter-stake-registry-hooks": minor
"@helium/voter-stake-registry-sdk": minor
"@helium/welcome-pack-sdk": minor
---

Move from `@coral-xyz/anchor` to `@anchor-lang/core` 0.31.2, the package Anchor now publishes its TypeScript client under. When a transaction lands and then fails, `sendAndConfirm` and `sendAll` now throw a `SendTransactionError` that holds the program logs and the original error message. Errors from `simulate` now also hold the program logs. With `@solana/web3.js` 1.92 or later, 0.31.1 lost them. Preflight failures are unchanged. `sendAndConfirm` and `sendAll` now fetch the blockhash at `commitment` when `preflightCommitment` is not set. SDK functions typed on `Program` reject a `Program` built from `@coral-xyz/anchor`, so consumers must import `Program` from `@anchor-lang/core`. A provider or IDL from either package is accepted. A pnpm or npm override can alias `@coral-xyz/anchor@^0.31` to `npm:@anchor-lang/core@0.31.2`. This override puts third-party SDKs on the same 0.31.2 code. Under npm, or pnpm with `node-linker=hoisted`, the override installs a second copy of the module, and `setProvider` state and `instanceof` checks do not cross between the two package names. Under the default pnpm linker, both names load one copy.
